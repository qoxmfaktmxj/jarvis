# P0/P1 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis의 인증/세션/환경설정/라우팅 레이어를 배포 전 안정화한다. 세 건의 실측 P0 버그(세션 TTL 불일치, 오픈 리다이렉트, 쿠키 resolver 분기)와 두 건의 P1 부채(env validation 부재, route registry 분산)를 제거하고, 대시보드의 프로토타입 하드코딩을 실데이터로 교체한다.

**Architecture:** 쿠키 resolver는 edge-safe 순수 함수로 추출해 middleware/api-auth 공통 사용. `createSession`은 전달받은 `expiresAt`을 신뢰 소스로 삼고 TTL 중복 계산 제거. env는 zod schema 단일 진입점을 만들고 production에서 누락 시 throw. route registry는 `lib/routes.ts` 한 파일로 수렴시켜 Sidebar/Topbar/CommandPalette/middleware redirect가 같은 source를 참조. 대시보드는 기존 `getDashboardData` 반환값을 그대로 KPI/활동/검색 트렌드 타일에 연결한다.

**Tech Stack:** Next.js 15 (App Router · Edge middleware), TypeScript, Drizzle ORM, zod, vitest, pnpm workspace.

**Scope boundary:** 신규 운영 화면(Wiki Health Dashboard, Ingest Pipeline Monitor)은 기능 설계가 필요하므로 본 plan에서 제외. 후속 brainstorm + plan으로 분리한다. 본 plan은 **수정·안정화**에 한정.

**Out of scope (deferred):**
- Production SSO UI (현 dev-login route는 `NODE_ENV === "production"` 차단 유지, UI는 P2 후속 PR)
- Admin nav 권한 기반 필터 (session.permissions 기반)
- Rate limiter Redis 교체
- TweaksPanel 접근성 개선, 모바일 drawer, Notification Center
- Wiki Health / Ingest Monitor / Review Queue / Source-Wiki Diff / Permission Inspector / Cost 화면

**Execution order:** Task 1 → 2 → 3은 P0 일괄. Task 4 → 5 → 6(원안의 7)은 각각 독립. 순서대로 커밋하며 subagent-driven으로 dispatch.

---

## File Structure

**New files:**
- `apps/web/lib/session-cookie.ts` — edge-safe `resolveSessionId(cookies)` + 상수 `SESSION_COOKIE_NAMES`
- `apps/web/lib/env.ts` — zod 기반 서버/클라이언트 env 검증 및 typed export
- `apps/web/lib/routes.ts` — 단일 route registry (Nav/Action items, legacy redirect map)
- `apps/web/app/(app)/dashboard/_components/DashboardKpiGrid.tsx` — KPI 타일 서버 컴포넌트
- `apps/web/app/(app)/dashboard/_components/DashboardActivityList.tsx` — 최근 활동 피드
- `apps/web/app/(app)/dashboard/_components/DashboardQuickQuestions.tsx` — 인기 검색 기반 퀵 질문
- `apps/web/lib/session-cookie.test.ts` — resolver 순수함수 테스트
- `apps/web/lib/env.test.ts` — zod schema 테스트
- `apps/web/lib/routes.test.ts` — registry shape/중복 검증

**Modified files:**
- `packages/auth/session.ts` — `createSession` / `refreshSession`가 `session.expiresAt` 반영
- `packages/auth/session.test.ts` — TTL 전파 assertion 추가
- `apps/web/middleware.ts` — `resolveSessionId` + legacy redirect map 사용
- `apps/web/lib/server/api-auth.ts` — 동일 resolver 사용, 중복 inline 코드 제거
- `apps/web/app/(auth)/login/page.tsx` — redirect 검증 강화 (`//`, backslash, 외부 origin 차단)
- `apps/web/components/layout/Sidebar.tsx` — routes.ts 소비
- `apps/web/components/layout/Topbar.tsx` — routes.ts 소비 + `/systems` 제거
- `apps/web/components/layout/CommandPalette.tsx` — routes.ts 소비 + `/systems` 제거
- `apps/web/app/api/auth/login/route.ts` — env.ts 사용 (NODE_ENV)
- `apps/web/app/(app)/dashboard/page.tsx` — 하드코딩 제거, 서버 컴포넌트 연결

---

## Conventions

**Commits:** Atomic per task. Message format: `fix(scope): short imperative` or `refactor(scope): short imperative`. No Co-Authored-By footer unless user requests.

**Tests:** vitest. Each TDD step:
1. Add failing test first
2. Run: `pnpm --filter <package> test -- <path>` and confirm FAIL
3. Write minimal implementation
4. Run same command and confirm PASS
5. Run `pnpm --filter web type-check` before commit

**Do not:** modify unrelated files, reformat whole files, add error handling for cases that can't occur.

---

## Task 1: `createSession` / `refreshSession` honors `session.expiresAt` (P0)

**Why it matters:** `apps/web/app/api/auth/login/route.ts:72`가 `keepSignedIn ? 30d : 8h`로 `expiresAt`을 계산해 `createSession()`에 넘기지만, `packages/auth/session.ts:28`의 `createSession`이 `newExpiry()` (8h 고정)를 DB에 쓴다. 쿠키 `maxAge`는 30d, DB `expires_at`은 8h → 로그인 유지 체크박스가 실제로는 8시간 후 풀린다.

**Files:**
- Modify: `packages/auth/session.ts:22-30,63-93`
- Test: `packages/auth/session.test.ts:42-55`, 추가 케이스 1개

- [ ] **Step 1: Add failing test for `createSession` TTL propagation**

Edit `packages/auth/session.test.ts` — replace the existing "createSession inserts a row with id, data, expires_at" test and add a new case. The existing test only checks `arg.expiresAt` is a Date; it must now assert propagation from the input session.

Add just below existing `"createSession inserts a row with id, data, expires_at"` (line 42 area):

```typescript
  it("createSession persists session.expiresAt to DB expires_at column", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values });

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const customExpiry = Date.now() + thirtyDaysMs;
    const s = makeSession({ expiresAt: customExpiry });

    await createSession(s);

    const arg = values.mock.calls[0]![0];
    expect(arg.expiresAt).toBeInstanceOf(Date);
    expect((arg.expiresAt as Date).getTime()).toBe(customExpiry);
  });
```

- [ ] **Step 2: Run the new test — verify it fails**

Run:

```bash
pnpm --filter @jarvis/auth test -- session.test.ts -t "persists session.expiresAt"
```

Expected: FAIL — received DB `expiresAt` differs from `customExpiry` (currently uses `newExpiry()` = now + 8h).

- [ ] **Step 3: Update `createSession` to use `session.expiresAt`**

Edit `packages/auth/session.ts:22-30`. Replace:

```typescript
export async function createSession(session: JarvisSession): Promise<void> {
  await db.insert(userSession).values({
    id: session.id,
    // JarvisSession (typed object) → Record<string, unknown> (DB schema type).
    // Structurally compatible but TS needs the widening; the cast is safe.
    data: session as unknown as Record<string, unknown>,
    expiresAt: newExpiry(),
  });
}
```

with:

```typescript
export async function createSession(session: JarvisSession): Promise<void> {
  await db.insert(userSession).values({
    id: session.id,
    // JarvisSession (typed object) → Record<string, unknown> (DB schema type).
    // Structurally compatible but TS needs the widening; the cast is safe.
    data: session as unknown as Record<string, unknown>,
    expiresAt: new Date(session.expiresAt),
  });
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @jarvis/auth test -- session.test.ts
```

Expected: PASS on the new test and all existing tests.

- [ ] **Step 5: Align `refreshSession` with the same principle**

`refreshSession` still needs a default TTL extension since callers don't pass a new `expiresAt`. Keep `SESSION_TTL_SEC` for refresh only, and compute the new `expiresAt` once, in one place. Edit `packages/auth/session.ts:63-93`:

Replace the body of `refreshSession` (keep the function signature):

```typescript
export async function refreshSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const rows = await db
    .select()
    .from(userSession)
    .where(eq(userSession.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return;

  const existing = parseSession(row.data);
  if (!existing) {
    await db.delete(userSession).where(eq(userSession.id, sessionId));
    return;
  }

  const extended = new Date(Date.now() + SESSION_TTL_SEC * 1000);
  const session: JarvisSession = {
    ...existing,
    expiresAt: extended.getTime(),
  };

  await db
    .update(userSession)
    .set({
      data: session as unknown as Record<string, unknown>,
      expiresAt: extended,
    })
    .where(eq(userSession.id, sessionId));
}
```

- [ ] **Step 6: Run full session test suite**

```bash
pnpm --filter @jarvis/auth test
```

Expected: PASS for all existing tests (`refreshSession extends expires_at and data.expiresAt`는 여전히 통과해야 한다 — `setArg.data.expiresAt > s.expiresAt` 여부만 확인하므로 영향 없음).

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @jarvis/auth type-check
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/auth/session.ts packages/auth/session.test.ts
git commit -m "fix(auth): createSession honors session.expiresAt

keepSignedIn was calculating a 30-day expiry in the login route but
createSession ignored it and wrote a fixed 8-hour TTL. Cookie maxAge
and DB expires_at now derive from the same value."
```

---

## Task 2: Unify session cookie resolver (P0)

**Why it matters:** `apps/web/middleware.ts:42`는 `sessionId` 쿠키만 읽어 리다이렉트 결정을 하지만, `apps/web/lib/server/api-auth.ts:12-17`은 `sessionId`와 `jarvis_session` 둘 다 읽는다. `jarvis_session`을 읽거나 쓰는 파일이 12개 존재하여 middleware가 먼저 `/login`으로 튕겨내는 경로가 있다. Edge runtime에서 동작하는 **순수 함수**로 추출해 두 곳에서 공통 사용한다.

**Files:**
- Create: `apps/web/lib/session-cookie.ts`
- Create: `apps/web/lib/session-cookie.test.ts`
- Modify: `apps/web/middleware.ts:42`
- Modify: `apps/web/lib/server/api-auth.ts:11-18`

- [ ] **Step 1: Write failing test for the resolver**

Create `apps/web/lib/session-cookie.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveSessionId, SESSION_COOKIE_NAMES } from "./session-cookie";

type CookieMap = { get: (name: string) => { value: string } | undefined };

function makeCookies(map: Record<string, string>): CookieMap {
  return {
    get: (name) => (name in map ? { value: map[name]! } : undefined),
  };
}

describe("resolveSessionId", () => {
  it("prefers sessionId when both are present", () => {
    const cookies = makeCookies({ sessionId: "new", jarvis_session: "legacy" });
    expect(resolveSessionId(cookies)).toBe("new");
  });

  it("falls back to jarvis_session when sessionId is missing", () => {
    const cookies = makeCookies({ jarvis_session: "legacy" });
    expect(resolveSessionId(cookies)).toBe("legacy");
  });

  it("returns null when neither cookie is set", () => {
    expect(resolveSessionId(makeCookies({}))).toBeNull();
  });

  it("treats empty string as missing", () => {
    const cookies = makeCookies({ sessionId: "" });
    expect(resolveSessionId(cookies)).toBeNull();
  });

  it("exposes the canonical names in lookup order", () => {
    expect(SESSION_COOKIE_NAMES).toEqual(["sessionId", "jarvis_session"]);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm --filter web test -- lib/session-cookie.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `apps/web/lib/session-cookie.ts`:

```typescript
/**
 * Edge-safe session cookie resolution.
 *
 * Two cookie names coexist during migration: `sessionId` (current login route)
 * and `jarvis_session` (legacy / SSO). Resolve with a single ordered lookup
 * so middleware and server-side auth agree on which session is active.
 */
export const SESSION_COOKIE_NAMES = ["sessionId", "jarvis_session"] as const;

export type SessionCookieName = (typeof SESSION_COOKIE_NAMES)[number];

export interface CookieSource {
  get(name: string): { value: string } | undefined;
}

export function resolveSessionId(cookies: CookieSource): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const raw = cookies.get(name)?.value;
    if (raw && raw.length > 0) return raw;
  }
  return null;
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm --filter web test -- lib/session-cookie.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Wire middleware to the shared resolver**

Edit `apps/web/middleware.ts`. Replace line 42 (`const sessionId = request.cookies.get("sessionId")?.value;`) with:

```typescript
  const sessionId = resolveSessionId(request.cookies);
```

Add at top of file after `import { NextRequest, NextResponse } from "next/server";`:

```typescript
import { resolveSessionId } from "./lib/session-cookie";
```

The `if (!sessionId)` branch at line 44 already handles `null` correctly (no change needed).

- [ ] **Step 6: Wire api-auth to the shared resolver**

Edit `apps/web/lib/server/api-auth.ts`. Replace lines 11-18:

```typescript
function resolveRequestSessionId(request: NextRequest) {
  return (
    request.headers.get("x-session-id") ??
    request.cookies.get("sessionId")?.value ??
    request.cookies.get("jarvis_session")?.value ??
    null
  );
}
```

with:

```typescript
import { resolveSessionId } from "@/lib/session-cookie";

function resolveRequestSessionId(request: NextRequest) {
  const fromHeader = request.headers.get("x-session-id");
  if (fromHeader && fromHeader.length > 0) return fromHeader;
  return resolveSessionId(request.cookies);
}
```

(Keep the `import { resolveSessionId }` at the top with the other imports; remove the per-cookie reads.)

- [ ] **Step 7: Add middleware test for legacy cookie fallback**

Add to `apps/web/__tests__/middleware-request-id.test.ts`, within the existing `describe`:

```typescript
  it("accepts legacy jarvis_session cookie without redirecting to /login", () => {
    const req = new NextRequest(new URL("http://localhost/dashboard"));
    req.cookies.set("jarvis_session", "legacy-session");
    const res = middleware(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
```

- [ ] **Step 8: Run the full middleware + api-auth tests**

```bash
pnpm --filter web test -- middleware-request-id session-cookie
```

Expected: PASS on all cases including the new legacy-cookie test.

- [ ] **Step 9: Type-check**

```bash
pnpm --filter web type-check
```

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/session-cookie.ts apps/web/lib/session-cookie.test.ts apps/web/middleware.ts apps/web/lib/server/api-auth.ts apps/web/__tests__/middleware-request-id.test.ts
git commit -m "fix(auth): unify session cookie resolver across middleware and api-auth

Middleware only read 'sessionId'; api-auth read both 'sessionId' and
'jarvis_session'. Legacy-cookied sessions were bounced at the edge
before the API layer could accept them. Both now share one resolver."
```

---

## Task 3: Harden open-redirect guard in login (P0)

**Why it matters:** `apps/web/app/(auth)/login/page.tsx:47` checks only `redirectTo.startsWith('/')`. `//evil.com/path`도 `/`로 시작하므로 `window.location.assign('//evil.com/path')`은 현재 origin의 스킴으로 외부 도메인에 이동한다. backslash (`\\evil.com`) 도 일부 브라우저에서 동일하게 해석된다.

**Files:**
- Create: `apps/web/app/(auth)/login/_lib/safe-redirect.ts`
- Create: `apps/web/app/(auth)/login/_lib/safe-redirect.test.ts`
- Modify: `apps/web/app/(auth)/login/page.tsx:47-48`

- [ ] **Step 1: Write failing test for `safeRedirectPath`**

Create `apps/web/app/(auth)/login/_lib/safe-redirect.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  const fallback = "/dashboard";

  it.each([
    ["/wiki", "/wiki"],
    ["/ask/abc", "/ask/abc"],
    ["/dashboard?tab=activity", "/dashboard?tab=activity"],
    ["/wiki#section", "/wiki#section"],
  ])("passes through safe internal path %s", (input, expected) => {
    expect(safeRedirectPath(input, fallback)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/path",
    "/\\\\evil.com",
    "\\\\evil.com",
    "http://evil.com",
    "https://evil.com/a",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "",
    "dashboard",  // missing leading slash
  ])("falls back for unsafe redirect %s", (input) => {
    expect(safeRedirectPath(input, fallback)).toBe(fallback);
  });

  it("falls back when input is null or undefined", () => {
    expect(safeRedirectPath(null, fallback)).toBe(fallback);
    expect(safeRedirectPath(undefined, fallback)).toBe(fallback);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm --filter web test -- safe-redirect
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the guard**

Create `apps/web/app/(auth)/login/_lib/safe-redirect.ts`:

```typescript
/**
 * Return `redirectTo` only if it is a same-origin path.
 *
 * Accepts: `/path`, `/path?query`, `/path#hash`.
 * Rejects: `//host`, `\\host`, any absolute URL, any non-http scheme,
 *          paths without a leading `/`, empty strings.
 *
 * Must run in the browser and on the server, so we avoid `URL` parsing
 * against an origin — a string-level check is enough for the path whitelist.
 */
export function safeRedirectPath(
  redirectTo: string | null | undefined,
  fallback: string
): string {
  if (!redirectTo) return fallback;
  if (redirectTo.length === 0) return fallback;
  if (redirectTo[0] !== "/") return fallback;
  if (redirectTo.startsWith("//")) return fallback;
  if (redirectTo.startsWith("/\\")) return fallback;
  // Defence-in-depth: reject any character that would let the string
  // re-enter URL parsing with a scheme (e.g. tab/newline smuggling).
  if (/[\x00-\x1f]/.test(redirectTo)) return fallback;
  return redirectTo;
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm --filter web test -- safe-redirect
```

Expected: PASS.

- [ ] **Step 5: Replace login page guard**

Edit `apps/web/app/(auth)/login/page.tsx`. Add import near the other imports (after the `LoadingOverlay` import):

```typescript
import { safeRedirectPath } from './_lib/safe-redirect';
```

Replace line 47:

```typescript
      const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard';
```

with:

```typescript
      const safeRedirect = safeRedirectPath(redirectTo, '/dashboard');
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter web type-check
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(auth\)/login/_lib/safe-redirect.ts apps/web/app/\(auth\)/login/_lib/safe-redirect.test.ts apps/web/app/\(auth\)/login/page.tsx
git commit -m "fix(auth): block protocol-relative and scheme redirects on login

startsWith('/') accepted //evil.com which window.location.assign would
resolve as an external navigation. New guard restricts redirect to
same-origin path + query + hash."
```

---

## Task 4: Env schema with zod validation (P1)

**Why it matters:** DB URL, MinIO credentials, OpenAI key, LLM gateway, feature flags, wiki root paths가 전역 `process.env` 접근으로 흩어져 있다. Production에서 누락돼도 localhost fallback으로 조용히 잘못된 DB에 붙을 수 있다. 단일 진입점에서 검증하고 typed export.

**Files:**
- Create: `apps/web/lib/env.ts`
- Create: `apps/web/lib/env.test.ts`
- Modify: `apps/web/app/api/auth/login/route.ts:12` (대표 사용처 1곳)
- Modify: `apps/web/lib/server/search-embedder.ts:11` (대표 사용처 1곳)

**Note on scope:** 이번 task는 **schema + 2곳 migration**까지만. 나머지 `process.env.*` 호출부 마이그레이션은 후속 PR (env 타입 확산은 별도 리팩토링). 여기서 목표는 "production에서 DATABASE_URL 누락 시 throw"를 보장하는 것.

- [ ] **Step 1: Verify zod is available**

Run:

```bash
pnpm --filter web list zod --depth 0
```

If not present (`@jarvis/shared` already uses zod — likely transitively available via hoisting):

```bash
pnpm --filter web add zod
```

- [ ] **Step 2: Write failing test for env schema**

Create `apps/web/lib/env.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  const baseValid = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://u:p@localhost:5432/jarvis",
    OPENAI_API_KEY: "sk-test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3010",
    WIKI_REPO_ROOT: "/tmp/jarvis",
  };

  it("accepts a valid dev environment", () => {
    const env = parseEnv(baseValid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe(baseValid.DATABASE_URL);
  });

  it("throws when DATABASE_URL is missing in production", () => {
    const { DATABASE_URL: _omit, ...rest } = baseValid;
    expect(() => parseEnv({ ...rest, NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("allows dev DATABASE_URL fallback but warns (non-production)", () => {
    const { DATABASE_URL: _omit, ...rest } = baseValid;
    const env = parseEnv({ ...rest, NODE_ENV: "development" });
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\//);
  });

  it("rejects malformed DATABASE_URL", () => {
    expect(() => parseEnv({ ...baseValid, DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("coerces feature flag strings to booleans", () => {
    const env = parseEnv({
      ...baseValid,
      FEATURE_SUBSCRIPTION_QUERY: "true",
      FEATURE_SUBSCRIPTION_INGEST: "false",
    });
    expect(env.FEATURE_SUBSCRIPTION_QUERY).toBe(true);
    expect(env.FEATURE_SUBSCRIPTION_INGEST).toBe(false);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

```bash
pnpm --filter web test -- lib/env.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the schema**

Create `apps/web/lib/env.ts`:

```typescript
import { z } from "zod";

const booleanFromString = z
  .union([z.boolean(), z.enum(["true", "false", "0", "1"])])
  .transform((value) => value === true || value === "true" || value === "1");

const urlString = z.string().url();

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: urlString.startsWith("postgresql://", {
    message: "DATABASE_URL must be a postgresql:// URL",
  }),
  OPENAI_API_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: urlString,
  WIKI_REPO_ROOT: z.string().min(1),
  WIKI_ROOT: z.string().min(1).optional(),
  ASK_AI_MODEL: z.string().min(1).default("gpt-5.4-mini"),
  LLM_GATEWAY_URL: urlString.optional(),
  LLM_GATEWAY_KEY: z.string().min(1).optional(),
  FEATURE_SUBSCRIPTION_QUERY: booleanFromString.default(false),
  FEATURE_SUBSCRIPTION_INGEST: booleanFromString.default(false),
  FEATURE_SUBSCRIPTION_LINT: booleanFromString.default(false),
});

export type Env = z.infer<typeof baseSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  return baseSchema.parse(raw);
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
pnpm --filter web test -- lib/env.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Wire one production code path through `env()` — login route**

Edit `apps/web/app/api/auth/login/route.ts:12`. Replace:

```typescript
  if (process.env["NODE_ENV"] === "production") {
```

with:

```typescript
  if (env().NODE_ENV === "production") {
```

Add import at top:

```typescript
import { env } from "@/lib/env";
```

- [ ] **Step 7: Wire search-embedder**

Edit `apps/web/lib/server/search-embedder.ts:11`. Replace:

```typescript
    const apiKey = process.env.OPENAI_API_KEY;
```

with:

```typescript
    const apiKey = env().OPENAI_API_KEY;
```

Add import at top:

```typescript
import { env } from "@/lib/env";
```

- [ ] **Step 8: Run login route test**

```bash
pnpm --filter web test -- api/auth/login
```

Expected: PASS — existing mocks don't set NODE_ENV=production, and `env()` defaults NODE_ENV to "development". If the test environment doesn't populate OPENAI_API_KEY or DATABASE_URL, the cached `env()` call in search-embedder.ts may crash on import. Guard against this by keeping `env()` lazy (already is — only called inside `embed()`).

- [ ] **Step 9: Type-check**

```bash
pnpm --filter web type-check
```

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/env.ts apps/web/lib/env.test.ts apps/web/app/api/auth/login/route.ts apps/web/lib/server/search-embedder.ts
git commit -m "feat(env): add zod-validated env loader with typed accessor

First two call sites migrated (login route, search embedder). Remaining
process.env usages move in follow-up PRs. Production now throws on
DATABASE_URL or OPENAI_API_KEY absence instead of falling back silently."
```

---

## Task 5: Unified route registry (P1)

**Why it matters:** Sidebar, Topbar, CommandPalette 세 곳에 nav item이 따로 하드코딩돼 있고 CommandPalette에는 legacy `/systems` 엔트리가 남아 있다. Middleware는 `/systems → /projects` 301을 친다. 단일 registry로 정리해 drift 제거.

**Files:**
- Create: `apps/web/lib/routes.ts`
- Create: `apps/web/lib/routes.test.ts`
- Modify: `apps/web/components/layout/Sidebar.tsx:39-55`
- Modify: `apps/web/components/layout/Topbar.tsx:18-30`
- Modify: `apps/web/components/layout/CommandPalette.tsx:47-66`

**Design decision:** `routes.ts`는 **UI-only source of truth**. Middleware의 legacy redirect map (`/systems → /projects`, `/attendance → /contractors`)도 동일 파일에 상수로 export해 테스트하지만, edge middleware는 계속 인라인 사용해도 된다 (edge runtime 제약). Source alignment는 lint 규칙이나 리뷰로 유지.

- [ ] **Step 1: Write failing test for route registry**

Create `apps/web/lib/routes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { NAV_ITEMS, ACTION_ITEMS, ROUTE_LABELS, LEGACY_REDIRECTS } from "./routes";

describe("routes registry", () => {
  it("has unique nav hrefs", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has unique action ids", () => {
    const ids = ACTION_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not contain legacy /systems in NAV_ITEMS or ACTION_ITEMS", () => {
    for (const item of [...NAV_ITEMS, ...ACTION_ITEMS]) {
      expect(item.href.startsWith("/systems")).toBe(false);
    }
  });

  it("ROUTE_LABELS covers every top-level nav href", () => {
    for (const nav of NAV_ITEMS) {
      const label = ROUTE_LABELS.find(([prefix]) => nav.href === prefix || nav.href.startsWith(prefix + "/"));
      expect(label, `missing label for ${nav.href}`).toBeDefined();
    }
  });

  it("LEGACY_REDIRECTS maps retired paths to current ones", () => {
    expect(LEGACY_REDIRECTS["/systems"]).toBe("/projects");
    expect(LEGACY_REDIRECTS["/attendance"]).toBe("/contractors");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter web test -- lib/routes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

Create `apps/web/lib/routes.ts`:

```typescript
import {
  BookOpen,
  CalendarX,
  ClipboardList,
  FilePlus,
  FileText,
  GitFork,
  HardDrive,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  Network,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  User,
  UserCircle,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavSection = "navigate" | "actions";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  description?: string;
  keywords?: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "nav-dashboard",       href: "/dashboard",            label: "대시보드",      icon: LayoutDashboard, description: "홈 · 이번 주 요약",  keywords: ["dashboard", "home", "홈"] },
  { id: "nav-notices",         href: "/notices",              label: "공지사항",      icon: Megaphone,       description: "사내 공지사항",      keywords: ["notice", "공지"] },
  { id: "nav-ask",             href: "/ask",                  label: "AI 질문",       icon: MessageSquare,   description: "AI에게 질문",        keywords: ["ai", "chat", "질문"], badge: "AI" },
  { id: "nav-search",          href: "/search",               label: "검색",          icon: Search,          description: "전체 리소스 검색",   keywords: ["search", "find"] },
  { id: "nav-wiki",            href: "/wiki",                 label: "위키",          icon: Library,         description: "워크스페이스 지식",  keywords: ["wiki", "knowledge"] },
  { id: "nav-wiki-graph",      href: "/wiki/graph",           label: "위키 그래프",   icon: GitFork,         description: "지식 그래프 탐색",   keywords: ["graph", "network"] },
  { id: "nav-wiki-ingest",     href: "/wiki/ingest/manual",   label: "위키 수동수집", icon: FilePlus,        description: "원문 수동 수집",     keywords: ["ingest", "manual"] },
  { id: "nav-knowledge",       href: "/knowledge",            label: "Knowledge",     icon: BookOpen,        description: "FAQ · 용어집 · HR",  keywords: ["kb", "faq", "glossary"] },
  { id: "nav-projects",        href: "/projects",             label: "프로젝트",      icon: Server,          description: "프로젝트 목록",      keywords: ["project", "system"] },
  { id: "nav-architecture",    href: "/architecture",         label: "아키텍처",      icon: Network,         description: "아키텍처 그래프",    keywords: ["architecture", "graph"] },
  { id: "nav-infra",           href: "/infra",                label: "인프라",        icon: HardDrive,       description: "인프라 맵",          keywords: ["infra"] },
  { id: "nav-add-dev",         href: "/add-dev",              label: "추가개발",      icon: ClipboardList,   description: "개발 요청",          keywords: ["request", "dev"] },
  { id: "nav-contractors",     href: "/contractors",          label: "외주인력관리",  icon: Users,           description: "외주 인력",          keywords: ["contractor", "outsourcing"] },
  { id: "nav-holidays",        href: "/holidays",             label: "공휴일 관리",   icon: CalendarX,       description: "공휴일 설정",        keywords: ["holiday"] },
  { id: "nav-profile",         href: "/profile",              label: "프로필",        icon: User,            description: "내 계정",            keywords: ["profile", "me"] },
];

export const ADMIN_ITEM: NavItem = {
  id: "nav-admin",
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  description: "Admin 콘솔",
  keywords: ["admin"],
};

export interface ActionItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  keywords?: readonly string[];
}

export const ACTION_ITEMS: readonly ActionItem[] = [
  { id: "act-new-notice",  href: "/notices/new",    label: "새 공지 작성", icon: FileText,  keywords: ["create", "new"] },
  { id: "act-new-kb",      href: "/knowledge/new",  label: "새 KB 페이지", icon: FileText,  keywords: ["create", "new"] },
  { id: "act-new-project", href: "/projects/new",   label: "새 프로젝트",  icon: Plus,      keywords: ["create", "new", "project"] },
  { id: "act-settings",    href: "/profile",        label: "설정",         icon: Settings,  keywords: ["settings"] },
];

export const ROUTE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/dashboard",    "대시보드"],
  ["/ask",          "AI 질문"],
  ["/search",       "검색"],
  ["/wiki",         "위키"],
  ["/knowledge",    "Knowledge Base"],
  ["/projects",     "프로젝트"],
  ["/admin",        "관리자"],
  ["/notices",      "공지"],
  ["/infra",        "인프라"],
  ["/architecture", "아키텍처"],
  ["/add-dev",      "추가개발"],
  ["/contractors",  "외주인력관리"],
  ["/holidays",     "공휴일 관리"],
  ["/profile",      "프로필"],
];

export const LEGACY_REDIRECTS: Record<string, string> = {
  "/systems": "/projects",
  "/attendance": "/contractors",
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter web test -- lib/routes.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Migrate Sidebar**

Edit `apps/web/components/layout/Sidebar.tsx`. Remove the local `NAV` and `ADMIN` declarations (lines 37-57) and remove the no-longer-used icon imports (the icons are now re-exported via routes.ts). Replace the imports block (lines 12-35) with:

```typescript
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { Capy } from "./Capy";
import { useSidebar } from "./uiPrefs";
import { NAV_ITEMS, ADMIN_ITEM, type NavItem } from "@/lib/routes";
```

Delete lines 37-57 (the local `NavItem` type + `NAV` + `ADMIN` constants). Keep `EXACT_MATCH_HREFS` (it is Sidebar-specific). Keep the `isActive`, `NavButton`, and `Sidebar` functions but replace the map source:

In the `Sidebar` component body, replace:

```tsx
        {NAV.map((item) => (
```

with:

```tsx
        {NAV_ITEMS.map((item) => (
```

And replace:

```tsx
        <NavButton
          item={ADMIN}
          active={isActive(pathname, ADMIN.href)}
          expanded={expanded}
        />
```

with:

```tsx
        <NavButton
          item={ADMIN_ITEM}
          active={isActive(pathname, ADMIN_ITEM.href)}
          expanded={expanded}
        />
```

- [ ] **Step 6: Migrate Topbar**

Edit `apps/web/components/layout/Topbar.tsx`. Remove lines 18-30 (the local `ROUTE_LABELS`). Add import at top:

```typescript
import { ROUTE_LABELS } from "@/lib/routes";
```

The `routeLabel` helper at line 32 already references `ROUTE_LABELS` — no change to the function body needed.

- [ ] **Step 7: Migrate CommandPalette**

Edit `apps/web/components/layout/CommandPalette.tsx`. Remove lines 47-66 (`NAV_ITEMS` and `ACTION_ITEMS` local arrays). Replace the large icon-import block at lines 13-30 with:

```typescript
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, ACTION_ITEMS, type NavItem, type ActionItem } from "@/lib/routes";
import { Search, type LucideIcon } from "lucide-react";
```

Adjust the `Item` type (line 35) to be a discriminated union aligned with registry types, or drop it and map inline. Simplest change — replace the `Item` type + the `items` memo (lines 35-45, 99):

```typescript
type PaletteItem = (NavItem | ActionItem) & {
  section: "navigate" | "actions";
};

function toPaletteItems(): PaletteItem[] {
  return [
    ...NAV_ITEMS.map((n) => ({ ...n, section: "navigate" as const })),
    ...ACTION_ITEMS.map((a) => ({ ...a, section: "actions" as const })),
  ];
}
```

Then replace:

```typescript
const items = useMemo(() => [...NAV_ITEMS, ...ACTION_ITEMS], []);
```

with:

```typescript
const items = useMemo(() => toPaletteItems(), []);
```

And update the `run` helper signature and `bySection` group typing to use `PaletteItem`:

```typescript
const run = (it: PaletteItem) => {
  if (it.href) router.push(it.href);
  setOpen(false);
};
```

(The original `Item` had an `action?: () => void` field that wasn't used in the concrete data — dropping it is fine. If you want to preserve it, add `action?: () => void` to `PaletteItem` and retain the `if (it.action) it.action();` line.)

Also in the `bySection` computation, adjust the record type:

```typescript
const bySection = useMemo(() => {
  const groups: Record<"navigate" | "actions" | "recent", PaletteItem[]> = {
    navigate: [],
    actions: [],
    recent: [],
  };
  filtered.forEach((it) => groups[it.section].push(it));
  return groups;
}, [filtered]);
```

- [ ] **Step 8: Run all UI tests**

```bash
pnpm --filter web test -- lib/routes components/layout
```

Expected: PASS on routes.test.ts. If there are existing Sidebar/Topbar/CommandPalette snapshot tests, update snapshots only after manual verification: the visible output should match.

- [ ] **Step 9: Type-check**

```bash
pnpm --filter web type-check
```

Expected: exit 0. If the TypeScript compiler complains about missing fields in the `PaletteItem` union, make `description` and `keywords` optional on both `NavItem` and `ActionItem` (they already are in the registry).

- [ ] **Step 10: Visual smoke test (manual)**

```bash
pnpm --filter web dev
```

Open `http://localhost:3010/dashboard`. Verify:
- Sidebar renders all 15 nav items + Admin footer
- Topbar command button opens palette
- Palette no longer shows a "시스템" entry pointing to `/systems`
- `/systems` URL in the address bar still 301-redirects to `/projects`

Kill the dev server when done.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/routes.ts apps/web/lib/routes.test.ts apps/web/components/layout/Sidebar.tsx apps/web/components/layout/Topbar.tsx apps/web/components/layout/CommandPalette.tsx
git commit -m "refactor(nav): unify route registry across Sidebar, Topbar, CommandPalette

Single source in lib/routes.ts. Drops the legacy /systems entry from
CommandPalette. Legacy redirect map co-located for middleware alignment."
```

---

## Task 6 (originally step 7): Wire dashboard to real DB data (P2)

**Why it matters:** `apps/web/app/(app)/dashboard/page.tsx:43`가 `getDashboardData()`를 호출하지만 결과를 UI에 반영하지 않는다. KPI 수치·활동·빠른 질문이 prototype 더미. 사용자는 이 화면을 "시스템 상태"로 해석한다.

**Decision on KPI sources:** 현재 DB에 바로 꽂을 수 있는 4가지 지표:

| 타일 | Source | 계산 |
|-----|--------|------|
| 위키 stale pages | `DashboardData.stalePages.length` | 0일 때 "0" + 무변화 |
| 최근 활동 (24h) | `DashboardData.recentActivity` → 24시간 이내 count | delta는 전일 대비 |
| 인기 검색 (주간) | `DashboardData.searchTrends[0].count` 합계 | delta 없음 |
| 빠른 링크 (표시 가능) | `DashboardData.quickLinks.length` | delta 없음 |

Trend 배열은 실데이터가 없으면 **보여주지 않고** KpiTile에 `trend={[]}` 전달. 컴포넌트가 빈 배열을 허용하도록 확인 후 대응.

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx` (전면 개편)
- Create: `apps/web/app/(app)/dashboard/_components/DashboardActivityList.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/DashboardQuickQuestions.tsx`
- Modify: `apps/web/app/(app)/dashboard/page.test.ts` (존재 시) — 현재 기존 테스트가 `getDashboardDataMock.mockResolvedValue(...)`을 설정하고 있어 재사용

- [ ] **Step 1: Inspect KpiTile to confirm empty-trend handling**

Read `apps/web/components/patterns/KpiTile.tsx` (find via `grep -l "KpiTile"`). Confirm it renders safely for `trend={[]}` or makes trend optional. If it requires non-empty — make it optional first in a tiny refactor before Step 3. Adjust only if required.

Run:

```bash
grep -n "trend" apps/web/components/patterns/KpiTile.tsx
```

- [ ] **Step 2: Write failing test for DashboardActivityList**

Create `apps/web/app/(app)/dashboard/_components/DashboardActivityList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardActivityList } from "./DashboardActivityList";

describe("DashboardActivityList", () => {
  it("renders an empty state when there are no entries", () => {
    render(<DashboardActivityList items={[]} />);
    expect(screen.getByText(/최근 활동이 없습니다/)).toBeInTheDocument();
  });

  it("renders up to 6 entries with action label and timestamp", () => {
    const now = new Date();
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      action: "wiki.edit",
      resourceType: "wiki_page",
      resourceId: null,
      userId: `u${i}`,
      createdAt: new Date(now.getTime() - i * 60_000),
    }));
    render(<DashboardActivityList items={items} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

```bash
pnpm --filter web test -- DashboardActivityList
```

Expected: FAIL — component missing.

- [ ] **Step 4: Implement DashboardActivityList**

Create `apps/web/app/(app)/dashboard/_components/DashboardActivityList.tsx`:

```typescript
import type { AuditLogEntry } from "@/lib/queries/dashboard";

const ACTION_LABELS: Record<string, string> = {
  "wiki.edit": "위키 편집",
  "wiki.publish": "위키 게시",
  "ask.query": "AI 질문",
  "contractor.create": "외주 등록",
  "holiday.update": "공휴일 변경",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatRelative(from: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - from.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function DashboardActivityList({ items }: { items: AuditLogEntry[] }) {
  if (items.length === 0) {
    return (
      <p style={{ padding: "24px 20px", fontSize: 13, color: "var(--muted)" }}>
        최근 활동이 없습니다.
      </p>
    );
  }

  const visible = items.slice(0, 6);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "6px 20px 20px" }}>
      {visible.map((item) => (
        <li
          key={item.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid var(--line2)",
          }}
        >
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: "var(--muted)" }}>{formatAction(item.action)}</span>
            <span> · {item.resourceType}</span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
            {formatRelative(item.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
pnpm --filter web test -- DashboardActivityList
```

Expected: PASS (2 tests).

- [ ] **Step 6: Write failing test for DashboardQuickQuestions**

Create `apps/web/app/(app)/dashboard/_components/DashboardQuickQuestions.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardQuickQuestions } from "./DashboardQuickQuestions";

describe("DashboardQuickQuestions", () => {
  it("renders fallback questions when trends are empty", () => {
    render(<DashboardQuickQuestions trends={[]} />);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("uses trending queries as quick questions", () => {
    render(
      <DashboardQuickQuestions
        trends={[
          { query: "이번 주 주요 결정 사항", count: 12 },
          { query: "사내 VPN 접속 방법", count: 9 },
        ]}
      />
    );
    expect(screen.getByText("이번 주 주요 결정 사항")).toBeInTheDocument();
    expect(screen.getByText("사내 VPN 접속 방법")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test — verify it fails**

```bash
pnpm --filter web test -- DashboardQuickQuestions
```

Expected: FAIL.

- [ ] **Step 8: Implement DashboardQuickQuestions**

Create `apps/web/app/(app)/dashboard/_components/DashboardQuickQuestions.tsx`:

```typescript
import Link from "next/link";
import { MessageSquare, ChevronRight, Sparkles } from "lucide-react";
import type { TrendItem } from "@/lib/queries/dashboard";

const FALLBACK_QUESTIONS = [
  "이번 주 주요 결정 사항",
  "진행 지연 중인 프로젝트",
  "이번 분기 채용 현황",
  "사내 VPN 접속 방법",
];

export function DashboardQuickQuestions({ trends }: { trends: TrendItem[] }) {
  const questions =
    trends.length > 0
      ? trends.slice(0, 4).map((t) => t.query)
      : FALLBACK_QUESTIONS;

  return (
    <div style={{ padding: "6px 20px 20px" }}>
      {questions.map((q) => (
        <Link
          key={q}
          href={`/ask?q=${encodeURIComponent(q)}`}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--panel)",
            marginBottom: 8,
            color: "var(--ink)",
            textDecoration: "none",
          }}
        >
          <span style={{ color: "var(--muted)", display: "inline-flex" }}>
            <MessageSquare size={16} />
          </span>
          <span style={{ flex: 1 }}>{q}</span>
          <span style={{ color: "var(--faint)", display: "inline-flex" }}>
            <ChevronRight size={16} />
          </span>
        </Link>
      ))}
      <Link
        href="/ask"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontWeight: 500,
          fontSize: 13.5,
          padding: "7px 12px",
          borderRadius: 8,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          color: "var(--ink2)",
          width: "100%",
          marginTop: 4,
          textDecoration: "none",
        }}
      >
        <Sparkles size={16} />
        새 질문 시작
      </Link>
    </div>
  );
}
```

- [ ] **Step 9: Run test — verify it passes**

```bash
pnpm --filter web test -- DashboardQuickQuestions
```

Expected: PASS.

- [ ] **Step 10: Rewrite dashboard/page.tsx to consume real data**

Edit `apps/web/app/(app)/dashboard/page.tsx`. Replace the entire file contents with:

```typescript
import { getDashboardData } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { isoWeekNumber } from "@/lib/date-utils";
import { PageHeader } from "@/components/patterns/PageHeader";
import { KpiTile } from "@/components/patterns/KpiTile";
import { RefreshCw } from "lucide-react";
import { DashboardActivityList } from "./_components/DashboardActivityList";
import { DashboardQuickQuestions } from "./_components/DashboardQuickQuestions";

export const dynamic = "force-dynamic";

function activityLast24h(items: { createdAt: Date }[], now = new Date()): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return items.filter((it) => it.createdAt.getTime() >= cutoff).length;
}

function trendingTotal(trends: { count: number }[]): number {
  return trends.reduce((sum, t) => sum + t.count, 0);
}

export default async function DashboardPage() {
  const session = await requirePageSession();
  const data = await getDashboardData(
    session.workspaceId,
    session.userId,
    session.roles,
    session.permissions
  );

  const week = isoWeekNumber(new Date());
  const stalePages = data.stalePages.length;
  const activityCount = activityLast24h(data.recentActivity);
  const trendsTotal = trendingTotal(data.searchTrends);
  const quickLinks = data.quickLinks.length;

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1320, margin: "0 auto" }}>
      <PageHeader
        stamp={`W${week}`}
        kicker="Dashboard"
        title="대시보드"
        subtitle={`${session.name}님, 반갑습니다. 이번 주 워크스페이스 스냅샷입니다.`}
        actions={
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              fontWeight: 500,
              padding: "7px 12px",
              borderRadius: 8,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              color: "var(--ink2)",
            }}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiTile
          label="점검 필요 위키"
          value={String(stalePages)}
          delta={stalePages === 0 ? "OK" : `+${stalePages}`}
          trend={[]}
          tone={stalePages === 0 ? "mint" : "amber"}
        />
        <KpiTile
          label="최근 24시간 활동"
          value={String(activityCount)}
          delta=""
          trend={[]}
          tone="accent"
        />
        <KpiTile
          label="이번 주 인기 검색"
          value={String(trendsTotal)}
          delta=""
          trend={[]}
          tone="neutral"
        />
        <KpiTile
          label="빠른 링크"
          value={String(quickLinks)}
          delta=""
          trend={[]}
          tone="neutral"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>최근 활동</div>
          </header>
          <DashboardActivityList items={data.recentActivity} />
        </section>

        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>빠른 질문</div>
          </header>
          <DashboardQuickQuestions trends={data.searchTrends} />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Update existing dashboard page test if present**

Run:

```bash
ls apps/web/app/\(app\)/dashboard/page.test.ts 2>/dev/null
```

If the file exists, read it. If it asserts hardcoded strings like "김지훈" or "이번 주 주요 결정 사항", update it to assert the new empty-state + the components render. Minimal change: ensure `getDashboardDataMock` returns the DashboardData shape the new page expects (quickLinks, recentActivity, stalePages, searchTrends all as arrays).

- [ ] **Step 12: Run all dashboard tests**

```bash
pnpm --filter web test -- dashboard
```

Expected: PASS.

- [ ] **Step 13: Type-check**

```bash
pnpm --filter web type-check
```

Expected: exit 0.

- [ ] **Step 14: Manual smoke**

```bash
pnpm --filter web dev
```

Open `/dashboard` after logging in. Verify KPI tiles show **actual numbers** from your local workspace (could be 0 for empty state). Activity feed shows audit log entries or empty state. Quick questions either show trending queries or fallback list.

- [ ] **Step 15: Commit**

```bash
git add apps/web/app/\(app\)/dashboard/
git commit -m "feat(dashboard): replace prototype data with real workspace metrics

KPI tiles now read from getDashboardData (stale pages count, 24h
activity, weekly search volume, visible quick links). Activity feed
and quick-questions panel consume audit log + popular_search tables,
with empty-state fallbacks. Responsive grid auto-fits narrow viewports."
```

---

## Deferred / Follow-up

**Task X (separate plan, Wiki Health + Ingest Monitor):** Requires brainstorm — data model, RBAC surface, refresh cadence, alert routing. Will produce `docs/superpowers/plans/YYYY-MM-DD-wiki-ops-dashboards.md` after a dedicated `superpowers:brainstorming` session.

**Other spun-off items (see spec "Out of scope"):** admin nav permission filter, Redis rate limiter, TweaksPanel a11y, Notification Center, mobile drawer, cost budget UI.

---

## Self-Review Checklist

- **Spec coverage:** Tasks 1-5 + 6(원안 7) cover the seven-step execution order minus the deferred new-screen task. ✓
- **Placeholders:** No "TBD", no "similar to above"; every step has code. ✓
- **Type consistency:** `JarvisSession.expiresAt` (number, ms) vs DB column (Date) — explicitly converted via `new Date(...)` in Task 1. `NavItem` shared between routes.ts and Sidebar/CommandPalette with identical shape. `PaletteItem` union intersection uses the same field names as `NavItem`/`ActionItem`. ✓
- **File paths:** All absolute from repo root; parens in `(auth)` / `(app)` preserved in commands. ✓
- **Commits atomic:** Each task = 1 commit. Tests live in the same commit as the implementation they verify. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-p0-p1-stabilization.md`.

**Execution: Subagent-Driven (sonnet)** per user instruction — dispatching a fresh sonnet subagent per task with two-stage review between tasks.
