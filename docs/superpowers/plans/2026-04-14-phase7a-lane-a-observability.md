# Phase-7A Lane A — Observability + Cost Kill-Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 OpenAI 호출을 `llm_call_log`에 기록하고, 일일 예산 초과 시 자동 차단하는 인프라를 `packages/ai`, `packages/db/schema`, `packages/shared`, `apps/web`에 얹는다.

**Architecture:** pino 기반 공용 로거가 request-id로 바인딩된 컨텍스트로 `ask.ts` / `embed.ts`의 OpenAI 호출을 래핑해 `llm_call_log` 테이블에 1호출=1행을 남긴다. 호출 직전 `assertBudget()`이 오늘 누적 비용을 합산해 `LLM_DAILY_BUDGET_USD`를 초과하면 `BudgetExceededError`를 던지고, 상위에서 `status='blocked_by_budget'` 행으로 기록 후 중단한다. Sentry는 DSN 없으면 no-op하는 thin wrapper로 양쪽 entry point(web, worker)가 공유한다.

**Tech Stack:** pino, @sentry/node, Drizzle 0.45.2, OpenAI SDK v4, vitest 3.1.1, Next.js 15, TypeScript 5.7, pg 8.

**Spec reference:** `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#1, §3 PR#2, §4 G1, §4 G7.

---

## File Structure

**Create (PR#1 observability):**
- `packages/db/schema/llm-call-log.ts` — Drizzle 테이블 + 인덱스 3종.
- `packages/db/migrations/<timestamp>_llm_call_log.sql` — `pnpm db:generate`가 생성.
- `packages/ai/logger.ts` — pino + `withRequestId()` + `logLlmCall()` (DB insert + pino).
- `packages/ai/__tests__/logger.test.ts` — pino 설정·request-id 바인딩·log row insert 단위 테스트.
- `packages/shared/sentry.ts` — `initSentry()` / `captureException` / `captureMessage` (DSN 없으면 no-op).
- `packages/shared/__tests__/sentry.test.ts` — no-DSN no-op 검증.
- `apps/web/__tests__/middleware-request-id.test.ts` — middleware request-id 주입 단위 테스트.

**Create (PR#2 cost kill-switch):**
- `packages/ai/budget.ts` — `assertBudget()` / `BudgetExceededError` / `recordBlocked()`.
- `packages/ai/__tests__/budget.test.ts` — under/over 두 경로 단위 테스트(mocked db).
- `packages/ai/__tests__/ask.budget.integration.test.ts` — 실 DB seeded cost로 ask 경로 차단 검증.
- `packages/ai/__tests__/embed.budget.integration.test.ts` — 동일, embed 경로.
- `apps/web/app/admin/llm-cost/page.tsx` — 최근 7일 workspace별 비용 합계 read-only 테이블.
- `scripts/eval-budget-test.ts` — G1 harness: 5회 호출 중 1회 통과/이후 차단 검증.

**Modify:**
- `apps/web/middleware.ts` — `x-request-id` 헤더 주입(없으면 `crypto.randomUUID()`).
- `packages/ai/ask.ts` — OpenAI 호출을 `assertBudget()` + `logLlmCall()`로 래핑.
- `packages/ai/embed.ts` — 동일 패턴(embed 모델).
- `package.json` (root) — `"eval:budget-test": "tsx scripts/eval-budget-test.ts"` 추가.
- `packages/ai/package.json` — `pino`, `@sentry/node` 의존성 추가.
- `packages/shared/package.json` — `@sentry/node` 의존성 추가.

---

## Task 1: 브랜치 생성 및 의존성 추가

- [ ] **Step 1: 브랜치 확인**

이미 worktree 안(`.claude/worktrees/zealous-shannon`, branch `claude/phase7a-lane-a-observability` 기준)에서 실행. 새 worktree가 필요하면:

```bash
cd C:/Users/Administrator/Desktop/devdev/jarvis
git worktree add .claude/worktrees/phase7a-lane-a -b claude/phase7a-lane-a-observability
cd .claude/worktrees/phase7a-lane-a
```

- [ ] **Step 2: 의존성 추가**

```bash
pnpm --filter @jarvis/ai add pino
pnpm --filter @jarvis/ai add -D pino-pretty @types/node
pnpm --filter @jarvis/ai add @sentry/node
pnpm --filter @jarvis/shared add @sentry/node
```

Expected: `packages/ai/package.json` / `packages/shared/package.json`의 `dependencies`에 각 패키지가 추가되고 `pnpm-lock.yaml` 업데이트.

- [ ] **Step 3: 커밋**

```bash
git add packages/ai/package.json packages/shared/package.json pnpm-lock.yaml
git commit -m "chore(phase7a): pino + @sentry/node 의존성 추가"
```

---

## Task 2: `llm_call_log` 스키마 + 마이그레이션

**Files:**
- Create: `packages/db/schema/llm-call-log.ts`
- Generate: `packages/db/migrations/*_llm_call_log.sql`

- [ ] **Step 1: 스키마 파일 작성**

```ts
// packages/db/schema/llm-call-log.ts
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const llmCallLog = pgTable(
  "llm_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    requestId: varchar("request_id", { length: 64 }),
    model: varchar("model", { length: 100 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 50 }),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .default("0")
      .notNull(),
    latencyMs: integer("latency_ms").default(0).notNull(),
    // 'ok' | 'error' | 'blocked_by_budget'
    status: varchar("status", { length: 30 }).notNull(),
    blockedBy: text("blocked_by"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceIdx: index("idx_llm_call_log_workspace").on(t.workspaceId),
    requestIdx: index("idx_llm_call_log_request").on(t.requestId),
    createdAtIdx: index("idx_llm_call_log_created_at").on(t.createdAt),
  }),
);

export type LlmCallLog = typeof llmCallLog.$inferSelect;
export type NewLlmCallLog = typeof llmCallLog.$inferInsert;
```

- [ ] **Step 2: schema index 파일 등록 확인**

Run:
```bash
grep -n "llm-call-log\|knowledge" packages/db/schema/index.ts
```

- [ ] **Step 3: schema index export 추가**

`packages/db/schema/index.ts`에 다음 한 줄 추가(기존 export 목록 스타일 그대로):

```ts
export * from "./llm-call-log.js";
```

- [ ] **Step 4: 마이그레이션 생성**

```bash
pnpm db:generate
```

Expected: `packages/db/migrations/` 아래 `NNNN_*_llm_call_log.sql` 생성. 파일 내 `CREATE TABLE "llm_call_log"` + 3개 `CREATE INDEX` 포함.

- [ ] **Step 5: 마이그레이션 파일 검사**

Run:
```bash
ls packages/db/migrations/ | tail -5
grep -l "llm_call_log" packages/db/migrations/*.sql
```

Expected: 방금 생성된 마이그레이션이 `llm_call_log` 문자열 포함.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/schema/llm-call-log.ts packages/db/schema/index.ts packages/db/migrations/
git commit -m "feat(db): llm_call_log 테이블 + 마이그레이션 추가"
```

---

## Task 3: logger.ts — 실패 테스트 먼저

**Files:**
- Create: `packages/ai/__tests__/logger.test.ts`
- Create (후속): `packages/ai/logger.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/logger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@jarvis/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a pino logger instance", async () => {
    const { logger } = await import("../logger.js");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("withRequestId binds request id into child logger", async () => {
    const { withRequestId } = await import("../logger.js");
    const child = withRequestId("req-abc");
    expect(child.bindings().requestId).toBe("req-abc");
  });

  it("logLlmCall inserts into llm_call_log and returns void", async () => {
    const { logLlmCall } = await import("../logger.js");
    const { db } = await import("@jarvis/db/client");
    await logLlmCall({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-xyz",
      model: "gpt-5.4-mini",
      promptVersion: "v1",
      tokensIn: 10,
      tokensOut: 20,
      costUsd: "0.0012",
      latencyMs: 123,
      status: "ok",
      blockedBy: null,
      errorMessage: null,
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter @jarvis/ai test -- logger.test
```

Expected: `Cannot find module '../logger.js'` 또는 동등 실패.

- [ ] **Step 3: 구현**

```ts
// packages/ai/logger.ts
import pino from "pino";
import { db } from "@jarvis/db/client";
import { llmCallLog, type NewLlmCallLog } from "@jarvis/db/schema";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "jarvis-ai" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.apiKey"],
    remove: true,
  },
});

export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}

export interface LlmCallLogRow {
  workspaceId: string;
  requestId: string | null;
  model: string;
  promptVersion: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: string; // numeric as string
  latencyMs: number;
  status: "ok" | "error" | "blocked_by_budget";
  blockedBy: string | null;
  errorMessage: string | null;
}

export async function logLlmCall(row: LlmCallLogRow): Promise<void> {
  const insertRow: NewLlmCallLog = {
    workspaceId: row.workspaceId,
    requestId: row.requestId ?? undefined,
    model: row.model,
    promptVersion: row.promptVersion ?? undefined,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    status: row.status,
    blockedBy: row.blockedBy ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
  };

  try {
    await db.insert(llmCallLog).values(insertRow);
  } catch (err) {
    logger.error(
      { err, requestId: row.requestId, model: row.model },
      "logLlmCall insert failed",
    );
    // 삼키기: 로깅 실패가 실제 LLM 호출 결과를 막지 않도록
  }

  logger.info(
    {
      requestId: row.requestId,
      workspaceId: row.workspaceId,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      latencyMs: row.latencyMs,
      status: row.status,
    },
    "llm.call",
  );
}
```

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter @jarvis/ai test -- logger.test
```

Expected: 3개 테스트 모두 pass.

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/logger.ts packages/ai/__tests__/logger.test.ts
git commit -m "feat(ai): pino logger + logLlmCall 헬퍼 추가"
```

---

## Task 4: middleware request-id 주입 — 실패 테스트 먼저

**Files:**
- Create: `apps/web/__tests__/middleware-request-id.test.ts`
- Modify: `apps/web/middleware.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// apps/web/__tests__/middleware-request-id.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware.js";

function makeReq(path: string, headers: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`http://localhost${path}`), {
    headers: new Headers(headers),
  });
  // 인증 우회: sessionId 쿠키 삽입
  req.cookies.set("sessionId", "test-session");
  return req;
}

describe("middleware request-id injection", () => {
  it("generates a request-id when missing", () => {
    const req = makeReq("/dashboard");
    const res = middleware(req);
    const injected = res.headers.get("x-request-id");
    expect(injected).toBeTruthy();
    expect(injected).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("propagates an existing x-request-id", () => {
    const req = makeReq("/dashboard", { "x-request-id": "req-existing-1" });
    const res = middleware(req);
    expect(res.headers.get("x-request-id")).toBe("req-existing-1");
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter web test -- middleware-request-id
```

Expected: `x-request-id` 헤더 없음으로 `expect(injected).toBeTruthy()` 실패.

- [ ] **Step 3: middleware 수정**

`apps/web/middleware.ts` 전체를 아래로 교체:

```ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/callback", "/api/auth"];

function ensureRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id");
  if (existing && existing.trim().length > 0) return existing;
  return crypto.randomUUID();
}

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = ensureRequestId(request);

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  if (pathname === "/api/health") {
    return withRequestId(NextResponse.next(), requestId);
  }

  const sessionId = request.cookies.get("sessionId")?.value;

  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      pathname === "/" ? "/dashboard" : pathname,
    );
    return withRequestId(NextResponse.redirect(loginUrl), requestId);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);
  requestHeaders.set("x-request-id", requestId);

  return withRequestId(
    NextResponse.next({ request: { headers: requestHeaders } }),
    requestId,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
```

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter web test -- middleware-request-id
```

Expected: 2개 테스트 모두 pass.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/middleware.ts apps/web/__tests__/middleware-request-id.test.ts
git commit -m "feat(web): middleware에 x-request-id 주입/전파"
```

---

## Task 5: Sentry wrapper — no-DSN no-op

**Files:**
- Create: `packages/shared/__tests__/sentry.test.ts`
- Create: `packages/shared/sentry.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/shared/__tests__/sentry.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("sentry wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
  });

  it("initSentry is a no-op when SENTRY_DSN missing", async () => {
    const { initSentry, captureException } = await import("../sentry.js");
    expect(() => initSentry()).not.toThrow();
    expect(() => captureException(new Error("boom"))).not.toThrow();
  });

  it("initSentry calls Sentry.init when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/0";
    const initMock = vi.fn();
    vi.doMock("@sentry/node", () => ({
      init: initMock,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    }));
    const { initSentry } = await import("../sentry.js");
    initSentry();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0].dsn).toBe(process.env.SENTRY_DSN);
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter @jarvis/shared test -- sentry
```

Expected: `Cannot find module '../sentry.js'` 실패.

- [ ] **Step 3: 구현**

```ts
// packages/shared/sentry.ts
import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return; // no-op
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? 0),
  });
  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function captureMessage(msg: string, context?: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureMessage(msg, context ? { extra: context } : undefined);
}
```

`packages/shared/index.ts`에 export 한 줄 추가:

```ts
export * from "./sentry.js";
```

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter @jarvis/shared test -- sentry
```

Expected: 2개 테스트 pass.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/sentry.ts packages/shared/index.ts packages/shared/__tests__/sentry.test.ts
git commit -m "feat(shared): Sentry thin wrapper (no-DSN no-op)"
```

---

## Task 6: `ask.ts` 로깅 wrapping — 실패 테스트 먼저

**Files:**
- Create: `packages/ai/__tests__/ask.log.test.ts`
- Modify: `packages/ai/ask.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/ask.log.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const logLlmCallMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn() }) },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
}));

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue(
          (async function* () {
            yield { choices: [{ delta: { content: "hi" } }] };
            yield {
              choices: [{ delta: {} }],
              usage: { prompt_tokens: 10, completion_tokens: 20 },
            };
          })(),
        ),
      },
    };
  }
  return { default: OpenAI };
});

describe("ask logs llm_call_log row", () => {
  beforeEach(() => {
    logLlmCallMock.mockClear();
  });

  it("calls logLlmCall once per generateAnswer invocation with status=ok", async () => {
    const { generateAnswer } = await import("../ask.js");
    const gen = generateAnswer(
      "q?",
      "<context/>",
      [],
      [],
      [],
      [],
      "simple",
      {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        requestId: "req-test-1",
      },
    );
    // drain
    for await (const _ of gen) {
      /* drain */
    }
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0][0];
    expect(row.status).toBe("ok");
    expect(row.tokensIn).toBe(10);
    expect(row.tokensOut).toBe(20);
    expect(row.requestId).toBe("req-test-1");
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter @jarvis/ai test -- ask.log
```

Expected: `generateAnswer` 시그니처가 7번째 인자(meta)를 받지 않아 TypeError 또는 row 미전달 실패.

- [ ] **Step 3: `ask.ts` 수정 — generateAnswer에 meta 파라미터 추가 + 로깅**

`packages/ai/ask.ts`에 다음 변경 적용.

파일 상단 import 블록에 추가:

```ts
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError } from './budget.js';
```

`ASK_MODEL` 선언 아래에 단가표(USD per 1K tokens)를 추가:

```ts
// 모델별 단가(USD per 1K tokens). 스펙 §3 PR#1 cost 계산용.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'gpt-5.4-mini': { in: 0.0005, out: 0.0015 },
  'gpt-5.4': { in: 0.005, out: 0.015 },
  'text-embedding-3-small': { in: 0.00002, out: 0 },
};

function computeCostUsd(model: string, tokensIn: number, tokensOut: number): string {
  const p = MODEL_PRICING[model] ?? { in: 0, out: 0 };
  const cost = (tokensIn * p.in + tokensOut * p.out) / 1000;
  return cost.toFixed(6);
}
```

`generateAnswer` 시그니처와 본문을 아래로 교체:

```ts
export interface AskMeta {
  workspaceId: string;
  requestId: string | null;
}

export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  caseSources: CaseSourceRef[],
  dirSources: DirectorySourceRef[],
  mode: import('./types.js').AskMode = 'simple',
  meta: AskMeta = { workspaceId: '00000000-0000-0000-0000-000000000000', requestId: null },
): AsyncGenerator<SSEEvent> {
  let tokensIn = 0;
  let tokensOut = 0;
  const startedAt = Date.now();

  const allTextSources: TextSourceRef[] = claims.map((c) => ({
    kind: 'text',
    pageId: c.pageId,
    title: c.pageTitle,
    url: c.pageUrl,
    excerpt: c.claimText.slice(0, 200),
    confidence: c.hybridScore,
  }));
  const allSources: SourceRef[] = [
    ...allTextSources,
    ...graphSources,
    ...caseSources,
    ...dirSources,
  ];

  // Budget gate BEFORE OpenAI call
  try {
    await assertBudget(meta.workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await logLlmCall({
        workspaceId: meta.workspaceId,
        requestId: meta.requestId,
        model: ASK_MODEL,
        promptVersion: null,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: '0',
        latencyMs: Date.now() - startedAt,
        status: 'blocked_by_budget',
        blockedBy: 'budget',
        errorMessage: err.message,
      });
      yield { type: 'error', message: 'daily budget exceeded' };
      return;
    }
    throw err;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: ASK_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 1024,
      messages: [
        { role: 'system', content: getSystemPrompt(mode) },
        { role: 'user', content: `${context}\n\nQuestion: ${question}` },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { type: 'text', content };
      }
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens ?? 0;
        tokensOut = chunk.usage.completion_tokens ?? 0;
      }
    }

    yield { type: 'sources', sources: allSources };
    yield { type: 'done', totalTokens: tokensIn + tokensOut };

    await logLlmCall({
      workspaceId: meta.workspaceId,
      requestId: meta.requestId,
      model: ASK_MODEL,
      promptVersion: null,
      tokensIn,
      tokensOut,
      costUsd: computeCostUsd(ASK_MODEL, tokensIn, tokensOut),
      latencyMs: Date.now() - startedAt,
      status: 'ok',
      blockedBy: null,
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logLlmCall({
      workspaceId: meta.workspaceId,
      requestId: meta.requestId,
      model: ASK_MODEL,
      promptVersion: null,
      tokensIn,
      tokensOut,
      costUsd: computeCostUsd(ASK_MODEL, tokensIn, tokensOut),
      latencyMs: Date.now() - startedAt,
      status: 'error',
      blockedBy: null,
      errorMessage: message,
    });
    yield { type: 'error', message };
  }
}
```

`askAI` 마지막 `yield* generateAnswer(...)` 호출에 meta를 전달:

```ts
  yield* generateAnswer(
    question,
    context,
    weightedClaims,
    weightedGraph,
    caseSources,
    dirSources,
    query.mode ?? 'simple',
    { workspaceId, requestId: query.requestId ?? null },
  );
```

그리고 `packages/ai/types.ts`의 `AskQuery`에 `requestId?: string | null`을 optional로 추가(스키마에 없다면).

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter @jarvis/ai test -- ask.log
```

Expected: 1 test pass.

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/ask.ts packages/ai/types.ts packages/ai/__tests__/ask.log.test.ts
git commit -m "feat(ai): ask.ts에 logLlmCall + budget 가드 래핑"
```

---

## Task 7: `embed.ts` 로깅 wrapping — 실패 테스트 먼저

**Files:**
- Create: `packages/ai/__tests__/embed.log.test.ts`
- Modify: `packages/ai/embed.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/embed.log.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const logLlmCallMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
}));

vi.mock("@jarvis/db/redis", () => ({
  getRedis: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  }),
}));

vi.mock("openai", () => {
  class OpenAI {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
        usage: { prompt_tokens: 7, total_tokens: 7 },
      }),
    };
  }
  return { default: OpenAI };
});

describe("embed logs llm_call_log row", () => {
  beforeEach(() => {
    logLlmCallMock.mockClear();
  });

  it("logs one row with status=ok and tokensIn from usage", async () => {
    const { generateEmbedding } = await import("../embed.js");
    await generateEmbedding("hello world", {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-e-1",
    });
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0][0];
    expect(row.status).toBe("ok");
    expect(row.model).toBe("text-embedding-3-small");
    expect(row.tokensIn).toBe(7);
    expect(row.requestId).toBe("req-e-1");
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter @jarvis/ai test -- embed.log
```

Expected: `generateEmbedding`이 2번째 인자를 받지 않아 TypeError 또는 logLlmCall 미호출.

- [ ] **Step 3: `embed.ts` 수정**

`packages/ai/embed.ts` 전체를 아래로 교체:

```ts
// packages/ai/embed.ts
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { getRedis } from '@jarvis/db/redis';
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError } from './budget.js';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const CACHE_TTL_SECONDS = 86400;
const EMBED_PRICE_PER_1K_IN = 0.00002;

function embedCacheKey(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return `embed:${hash}`;
}

function computeCostUsd(tokensIn: number): string {
  return ((tokensIn * EMBED_PRICE_PER_1K_IN) / 1000).toFixed(6);
}

export interface EmbedMeta {
  workspaceId: string;
  requestId?: string | null;
}

const DEFAULT_META: Required<EmbedMeta> = {
  workspaceId: '00000000-0000-0000-0000-000000000000',
  requestId: null,
};

export async function generateEmbedding(
  text: string,
  meta: EmbedMeta = DEFAULT_META,
): Promise<number[]> {
  const redis = getRedis();
  const cacheKey = embedCacheKey(text);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  const startedAt = Date.now();
  const workspaceId = meta.workspaceId;
  const requestId = meta.requestId ?? null;

  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await logLlmCall({
        workspaceId,
        requestId,
        model: EMBED_MODEL,
        promptVersion: null,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: '0',
        latencyMs: Date.now() - startedAt,
        status: 'blocked_by_budget',
        blockedBy: 'budget',
        errorMessage: err.message,
      });
    }
    throw err;
  }

  try {
    const response = await getOpenAI().embeddings.create({
      model: EMBED_MODEL,
      input: text.trim(),
      dimensions: EMBED_DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    const tokensIn = response.usage?.prompt_tokens ?? 0;
    await logLlmCall({
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      tokensIn,
      tokensOut: 0,
      costUsd: computeCostUsd(tokensIn),
      latencyMs: Date.now() - startedAt,
      status: 'ok',
      blockedBy: null,
      errorMessage: null,
    });

    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', CACHE_TTL_SECONDS);
    return embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logLlmCall({
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: '0',
      latencyMs: Date.now() - startedAt,
      status: 'error',
      blockedBy: null,
      errorMessage: message,
    });
    throw err;
  }
}
```

`ask.ts`에서 `generateEmbedding(question)` 호출부를 `generateEmbedding(question, { workspaceId, requestId: null })`으로 업데이트(retrieveRelevantClaims 시그니처에 workspaceId가 이미 있음).

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter @jarvis/ai test -- embed.log
```

Expected: 1 test pass.

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/embed.ts packages/ai/ask.ts packages/ai/__tests__/embed.log.test.ts
git commit -m "feat(ai): embed.ts에 logLlmCall + budget 가드 래핑"
```

---

## Task 8: `budget.ts` 단위 테스트(mocked db) 먼저

**Files:**
- Create: `packages/ai/__tests__/budget.test.ts`
- Create: `packages/ai/budget.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/budget.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();

vi.mock("@jarvis/db/client", () => ({
  db: { execute: executeMock },
}));

describe("assertBudget", () => {
  beforeEach(() => {
    executeMock.mockReset();
    process.env.LLM_DAILY_BUDGET_USD = "1.00";
  });

  it("passes under budget", async () => {
    executeMock.mockResolvedValue({ rows: [{ total: "0.25" }] });
    const { assertBudget } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).resolves.toBeUndefined();
  });

  it("throws BudgetExceededError over budget", async () => {
    executeMock.mockResolvedValue({ rows: [{ total: "1.50" }] });
    const { assertBudget, BudgetExceededError } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("uses default $10 when env missing", async () => {
    delete process.env.LLM_DAILY_BUDGET_USD;
    executeMock.mockResolvedValue({ rows: [{ total: "9.99" }] });
    const { assertBudget } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 실행**

```bash
pnpm --filter @jarvis/ai test -- budget.test
```

Expected: `Cannot find module '../budget.js'`.

- [ ] **Step 3: 구현**

```ts
// packages/ai/budget.ts
import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';

export class BudgetExceededError extends Error {
  constructor(public workspaceId: string, public spent: number, public limit: number) {
    super(
      `LLM daily budget exceeded for workspace ${workspaceId}: $${spent.toFixed(
        4,
      )} >= $${limit.toFixed(2)}`,
    );
    this.name = 'BudgetExceededError';
  }
}

function dailyLimitUsd(): number {
  const raw = process.env['LLM_DAILY_BUDGET_USD'];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export async function assertBudget(workspaceId: string): Promise<void> {
  const limit = dailyLimitUsd();
  const result = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(cost_usd), 0)::text AS total
    FROM llm_call_log
    WHERE workspace_id = ${workspaceId}::uuid
      AND status = 'ok'
      AND created_at >= date_trunc('day', now())
  `);
  const spent = Number(result.rows[0]?.total ?? '0');
  if (spent >= limit) {
    throw new BudgetExceededError(workspaceId, spent, limit);
  }
}

export async function recordBlocked(workspaceId: string, reason: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO llm_call_log
      (workspace_id, model, status, blocked_by, error_message)
    VALUES
      (${workspaceId}::uuid, 'unknown', 'blocked_by_budget', ${reason}, ${reason})
  `);
}
```

- [ ] **Step 4: 통과 실행**

```bash
pnpm --filter @jarvis/ai test -- budget.test
```

Expected: 3 tests pass.

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/budget.ts packages/ai/__tests__/budget.test.ts
git commit -m "feat(ai): assertBudget + BudgetExceededError 추가"
```

---

## Task 9: ask.ts 예산 차단 통합 테스트(실 DB)

**Files:**
- Create: `packages/ai/__tests__/ask.budget.integration.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/ask.budget.integration.test.ts
// 실 DB를 사용하는 integration test. vitest.config.ts의 integration 프로젝트에서만 실행.
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jarvis/db/client";
import { sql } from "drizzle-orm";
import { generateAnswer } from "../ask.js";

const WS = "00000000-0000-0000-0000-00000000abcd";

describe("ask budget integration", () => {
  beforeEach(async () => {
    process.env.LLM_DAILY_BUDGET_USD = "0.01";
    await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);
    // seed: 오늘 이미 $0.02 소비
    await db.execute(sql`
      INSERT INTO llm_call_log
        (workspace_id, model, tokens_in, tokens_out, cost_usd, latency_ms, status)
      VALUES
        (${WS}::uuid, 'gpt-5.4-mini', 100, 100, 0.02, 100, 'ok')
    `);
  });

  it("blocks ask when today's spent exceeds LLM_DAILY_BUDGET_USD", async () => {
    const events: string[] = [];
    for await (const ev of generateAnswer(
      "q",
      "<context/>",
      [],
      [],
      [],
      [],
      "simple",
      { workspaceId: WS, requestId: "req-it-1" },
    )) {
      events.push(ev.type);
      if (ev.type === "error") {
        expect(ev.message).toMatch(/budget/i);
      }
    }
    expect(events).toContain("error");
    const rows = await db.execute<{ status: string; blocked_by: string | null }>(sql`
      SELECT status, blocked_by
      FROM llm_call_log
      WHERE workspace_id = ${WS}::uuid
        AND request_id = 'req-it-1'
    `);
    expect(rows.rows[0]?.status).toBe("blocked_by_budget");
    expect(rows.rows[0]?.blocked_by).toBe("budget");
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @jarvis/ai test:integration -- ask.budget
```

Expected: 마이그레이션 적용 후(`pnpm db:migrate`) 1 test pass. 이미 Task 6에서 ask.ts가 assertBudget를 호출하도록 수정했으므로 추가 구현 불요.

- [ ] **Step 3: 커밋**

```bash
git add packages/ai/__tests__/ask.budget.integration.test.ts
git commit -m "test(ai): ask 예산 차단 integration 테스트"
```

---

## Task 10: embed.ts 예산 차단 통합 테스트(실 DB)

**Files:**
- Create: `packages/ai/__tests__/embed.budget.integration.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/ai/__tests__/embed.budget.integration.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jarvis/db/client";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "../embed.js";
import { BudgetExceededError } from "../budget.js";

const WS = "00000000-0000-0000-0000-00000000beef";

describe("embed budget integration", () => {
  beforeEach(async () => {
    process.env.LLM_DAILY_BUDGET_USD = "0.01";
    await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);
    await db.execute(sql`
      INSERT INTO llm_call_log
        (workspace_id, model, tokens_in, tokens_out, cost_usd, latency_ms, status)
      VALUES
        (${WS}::uuid, 'text-embedding-3-small', 1000, 0, 0.02, 50, 'ok')
    `);
  });

  it("throws BudgetExceededError and records blocked_by=budget row", async () => {
    await expect(
      generateEmbedding("hello", { workspaceId: WS, requestId: "req-it-2" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    const rows = await db.execute<{ status: string; blocked_by: string | null }>(sql`
      SELECT status, blocked_by
      FROM llm_call_log
      WHERE workspace_id = ${WS}::uuid
        AND request_id = 'req-it-2'
    `);
    expect(rows.rows[0]?.status).toBe("blocked_by_budget");
    expect(rows.rows[0]?.blocked_by).toBe("budget");
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @jarvis/ai test:integration -- embed.budget
```

Expected: 1 test pass.

- [ ] **Step 3: 커밋**

```bash
git add packages/ai/__tests__/embed.budget.integration.test.ts
git commit -m "test(ai): embed 예산 차단 integration 테스트"
```

---

## Task 11: Admin LLM cost 페이지 (read-only)

**Files:**
- Create: `apps/web/app/admin/llm-cost/page.tsx`

- [ ] **Step 1: 구현**

```tsx
// apps/web/app/admin/llm-cost/page.tsx
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface Row {
  workspace_id: string;
  model: string;
  calls: string;
  total_cost: string;
  blocked: string;
}

async function fetchRows(): Promise<Row[]> {
  const res = await db.execute<Row>(sql`
    SELECT
      workspace_id::text AS workspace_id,
      model,
      COUNT(*)::text AS calls,
      COALESCE(SUM(cost_usd), 0)::text AS total_cost,
      SUM(CASE WHEN status = 'blocked_by_budget' THEN 1 ELSE 0 END)::text AS blocked
    FROM llm_call_log
    WHERE created_at >= now() - interval '7 days'
    GROUP BY workspace_id, model
    ORDER BY total_cost DESC
    LIMIT 200
  `);
  return res.rows;
}

export default async function LlmCostPage() {
  const rows = await fetchRows();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">LLM Cost — 최근 7일</h1>
      <p className="text-sm text-gray-500 mb-4">
        workspace × model 기준 집계. blocked = 예산 차단으로 기록된 호출 수.
      </p>
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left p-2">Workspace</th>
            <th className="text-left p-2">Model</th>
            <th className="text-right p-2">Calls</th>
            <th className="text-right p-2">Total (USD)</th>
            <th className="text-right p-2">Blocked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 font-mono text-xs">{r.workspace_id}</td>
              <td className="p-2">{r.model}</td>
              <td className="p-2 text-right">{r.calls}</td>
              <td className="p-2 text-right">${Number(r.total_cost).toFixed(4)}</td>
              <td className="p-2 text-right">{r.blocked}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-4 text-center text-gray-400" colSpan={5}>
                최근 7일 호출 기록이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: 빌드 체크**

```bash
pnpm --filter web build
```

Expected: 빌드 성공, 새 라우트 `/admin/llm-cost` 출력.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/app/admin/llm-cost/page.tsx
git commit -m "feat(web): /admin/llm-cost read-only 대시보드"
```

---

## Task 12: `scripts/eval-budget-test.ts` + root 스크립트

**Files:**
- Create: `scripts/eval-budget-test.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: harness 작성**

```ts
// scripts/eval-budget-test.ts
// G1 harness: 인위적 예산 초과로 차단 동작 검증.
// 사용: pnpm eval:budget-test
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateAnswer } from '@jarvis/ai/ask';

process.env.LLM_DAILY_BUDGET_USD = '0.01';
const WS = process.env['EVAL_WORKSPACE_ID'] ?? '00000000-0000-0000-0000-0000000000ee';

async function drain(gen: AsyncGenerator<{ type: string; message?: string }>) {
  const events: string[] = [];
  for await (const ev of gen) {
    events.push(ev.type);
  }
  return events;
}

async function main() {
  await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);

  // 1회차: 예산 아직 0, 통과 가능
  // (ASK_MODEL 단가 * 소폭 토큰 = $0.01 미만이어야 1회는 통과)
  // 이후 호출은 누적 cost_usd로 차단돼야 한다.
  let blocked = 0;
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const events = await drain(
      generateAnswer('ping?', '<context/>', [], [], [], [], 'simple', {
        workspaceId: WS,
        requestId: `eval-${i}`,
      }) as AsyncGenerator<{ type: string; message?: string }>,
    );
    if (events.includes('error')) blocked++;
    else ok++;
  }

  const rows = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*)::text AS count
    FROM llm_call_log
    WHERE workspace_id = ${WS}::uuid
    GROUP BY status
  `);

  console.log('eval-budget-test summary:', { ok, blocked, rows: rows.rows });

  const blockedRows = rows.rows.find((r) => r.status === 'blocked_by_budget');
  if (!blockedRows || Number(blockedRows.count) < 1) {
    console.error('FAIL: no blocked_by_budget rows recorded');
    process.exit(1);
  }
  if (blocked < 1) {
    console.error('FAIL: expected at least 1 blocked call');
    process.exit(1);
  }
  console.log('PASS: G1 — kill-switch triggered and rows recorded');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: root `package.json`에 스크립트 추가**

`package.json`의 `"scripts"` 맵에 아래 엔트리 한 줄 추가:

```json
"eval:budget-test": "tsx scripts/eval-budget-test.ts"
```

- [ ] **Step 3: 실행 확인(드라이런은 Task 13에서)**

Run (구문 오류만 확인):
```bash
pnpm exec tsc --noEmit -p packages/ai
```

Expected: no errors.

- [ ] **Step 4: 커밋**

```bash
git add scripts/eval-budget-test.ts package.json
git commit -m "feat(eval): eval-budget-test harness + root 스크립트"
```

---

## Task 13: G1 dry-run — `pnpm eval:budget-test` 로컬 실행

- [ ] **Step 1: DB 마이그레이션 적용**

```bash
pnpm db:migrate
```

Expected: `llm_call_log` 테이블 생성 로그.

- [ ] **Step 2: harness 실행**

```bash
pnpm eval:budget-test
```

Expected stdout (shape):
```
eval-budget-test summary: { ok: 1, blocked: 4, rows: [ { status: 'ok', count: '1' }, { status: 'blocked_by_budget', count: '4' } ] }
PASS: G1 — kill-switch triggered and rows recorded
```

Exit code 0.

- [ ] **Step 3: SQL 재확인**

```bash
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM llm_call_log WHERE workspace_id = '00000000-0000-0000-0000-0000000000ee' GROUP BY status;"
```

Expected: `blocked_by_budget | 4` 이상, `ok | 1` 내외.

- [ ] **Step 4: 결과 기록용 커밋(문서 업데이트는 PR#G에서 — 여기서는 스킵 가능)**

no-op 커밋 없음.

---

## Task 14: G7 dry-run — 실사용 스모크 3회 + SQL

- [ ] **Step 1: dev 서버 가동**

```bash
pnpm --filter web dev
```

별도 터미널에서 dev 환경에 로그인한 세션으로 `/ask` 인터페이스 또는 API를 통해 3건의 실제 질의 전송(예: "급여명세서 확인 방법", "휴가 규정", "VPN 접속 오류").

- [ ] **Step 2: log row 수 확인**

```bash
psql "$DATABASE_URL" -c "SELECT request_id, model, tokens_in, tokens_out, cost_usd, status, created_at FROM llm_call_log WHERE created_at >= now() - interval '10 minutes' ORDER BY created_at DESC;"
```

Expected: 최소 3행(ask 3건) + embedding 호출 수 × 3 (각 질의마다 1 embedding). 모든 행에 `request_id` 값 존재, `status='ok'`.

- [ ] **Step 3: 결과를 PR 본문에 붙여넣을 수 있도록 저장**

```bash
psql "$DATABASE_URL" -c "SELECT request_id, model, tokens_in, tokens_out, cost_usd, status FROM llm_call_log WHERE created_at >= now() - interval '10 minutes' ORDER BY created_at DESC;" > /tmp/g7-smoke.txt
cat /tmp/g7-smoke.txt
```

---

## Task 15: PR push + gh pr create

- [ ] **Step 1: push**

```bash
git push -u origin claude/phase7a-lane-a-observability
```

- [ ] **Step 2: PR 생성**

```bash
gh pr create --title "feat(phase7a-A): observability + cost kill-switch (PR#1 + PR#2)" --body "$(cat <<'EOF'
## Summary

Phase-7A Lane A: 모든 OpenAI 호출을 `llm_call_log`에 기록하고, 일일 예산 초과 시 자동 차단한다.

- **PR#1 observability**: `llm_call_log` 테이블 + pino logger + request-id 전파 + Sentry thin wrapper
- **PR#2 cost kill-switch**: `assertBudget()` 가드 + `/admin/llm-cost` read-only 대시보드 + `pnpm eval:budget-test` harness

Spec: `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#1, §3 PR#2, §4 G1, §4 G7.

## Test plan

- [x] `pnpm --filter @jarvis/ai test` — unit(logger, budget, ask.log, embed.log) all pass
- [x] `pnpm --filter @jarvis/shared test` — sentry no-op + init 호출 모두 pass
- [x] `pnpm --filter web test -- middleware-request-id` — 2 cases pass
- [x] `pnpm --filter @jarvis/ai test:integration` — ask/embed budget integration pass
- [x] **G1 dry-run**: `pnpm eval:budget-test` → `PASS` + `blocked_by_budget` row ≥ 1
- [x] **G7 dry-run**: 실사용 3건 → `SELECT ... FROM llm_call_log` 결과 3+ 행 (`/tmp/g7-smoke.txt`)
- [x] `/admin/llm-cost` 페이지 빌드 성공, 최근 7일 행 표시

## Rollback

PR 전체 revert로 원복 가능. `llm_call_log` 테이블은 남아도 무해(읽는 코드만 제거됨). `LLM_DAILY_BUDGET_USD` 미설정 시 기본 $10으로 사실상 무해.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: PR URL 기록**

출력된 URL을 spec §9 Revision log에 추가(PR#G에서 반영 예정).

---

## Self-Review Checklist

- [ ] `packages/db/schema/llm-call-log.ts`가 `knowledge.ts` 컨벤션(flat 디렉터리, `.js` import 확장자, customType 없이 단순 컬럼) 준수
- [ ] `pnpm db:generate`로 마이그레이션 파일 1건만 추가 (수동 편집 없음)
- [ ] `packages/ai/logger.ts` — `logLlmCall`이 DB insert 실패 시 삼키기(로그 실패가 실서비스 막지 않음)
- [ ] `apps/web/middleware.ts` — 기존 `PUBLIC_PATHS`, `/api/health`, redirect 경로 전부 `x-request-id` 응답 헤더 포함
- [ ] `packages/shared/sentry.ts` — SENTRY_DSN 미설정 환경에서 `@sentry/node` 실제 호출 0회
- [ ] `packages/ai/ask.ts` — `generateAnswer` 모든 종료 경로(성공/오류/budget block)에서 `logLlmCall` 정확히 1회
- [ ] `packages/ai/embed.ts` — cache hit일 때는 `logLlmCall` 호출하지 않음(OpenAI 호출 자체가 없으므로 의도적)
- [ ] `packages/ai/budget.ts` — `LLM_DAILY_BUDGET_USD` 기본 $10, 잘못된 값은 기본값으로 폴백
- [ ] `/admin/llm-cost` — Server Component, `dynamic = 'force-dynamic'`, read-only(mutation 없음)
- [ ] `scripts/eval-budget-test.ts` — exit code 0(성공)/1(실패) 명확, seed 데이터 beforeEach-style 정리
- [ ] Root `package.json` — `"eval:budget-test"` 엔트리 1줄 추가, 다른 스크립트 영향 없음
- [ ] 모든 test-first 단계에서 실패 실행 → 구현 → 통과 실행 순서 유지, 커밋은 구현+테스트 묶어서 Task당 1커밋
- [ ] G1 / G7 dry-run 결과 PR 본문에 명시적 체크 표시
- [ ] Drizzle schema-drift hook(`scripts/check-schema-drift.mjs --hook`) 통과 확인
