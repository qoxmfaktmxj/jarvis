# Ask AI — Harness-first Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask AI의 retrieval 아키텍처를 **embedding 기반 RAG → tool-use agent 기반 Harness**로 전면 전환한다. Karpathy LLM Wiki 패턴 + graphify 구조를 그대로 구현한다. 결과: Ollama/벡터 인덱싱 없이 **LLM이 wiki-fs를 grep·read·follow-link 하며 답**하고, 탐색 로그는 `wiki/index.md` · `wiki/log.md` 에 누적된다.

**Architecture:** Ask AI는 tool-use loop 기반 agent로 재작성된다. 4개 도구(`wiki-grep`, `wiki-read`, `wiki-follow-link`, `wiki-graph-query`)가 wiki-fs와 graphify 그래프를 탐색 대상으로 삼는다. sensitivity 필터는 tool-wrapper 레벨에서 강제된다. embedding 파이프라인(`embed.ts`, `embed_cache`, `knowledge_page.embedding`, HNSW, `search-embedder.ts`, `worker/jobs/embed.ts`)은 전량 삭제된다. 검색 코드는 BM25/trigram만 남긴다.

**Tech Stack:** Next.js 15, Drizzle ORM (PostgreSQL 16 + pg_trgm), Vercel AI SDK tool-use, graphify MCP/JSON, pg-boss, Vitest + Playwright. **pgvector/HNSW 의존 제거.**

---

## Context for New Session (READ FIRST)

**Branch:** `feat/ask-harness-transition`
**Base:** `main` (as of 2026-04-23, after PRs #13/#14/#15 merged)
**Expected duration:** ~7~9 working days
**Worktree:** `.claude/worktrees/ask-harness-transition`

**Start commands:**

```bash
cd C:/Users/kms/Desktop/dev/jarvis
git fetch origin
git switch main
git pull origin main
git worktree add .claude/worktrees/ask-harness-transition -b feat/ask-harness-transition main
cd .claude/worktrees/ask-harness-transition
pnpm install
node scripts/check-llm-models.mjs   # 시작 상태 확인
pnpm --filter @jarvis/web test       # baseline
```

**Preconditions assumed at start:**
- `wiki_page_index` 1,331개 페이지, 본문은 git 저장소의 `wiki/**/*.md` (wiki-fs SSoT)
- `knowledge_page.embedding` 전부 NULL, `embed_cache` 0건, `llm_call_log.op='embed'` 0회 (확인: 2026-04-23)
- Graphify 스킬 (`/graphify`) 이미 설치됨. `AGENTS.md`에 graphify 언급 있음
- OpenAI API (`gpt-5.4`, `gpt-5.4-mini`) 사용 가능

**Existing constraints (DO NOT VIOLATE):**
- `docs/policies/llm-models.md` — `text-embedding-3-small` 현재 허용. **Task F1/F2에서 FORBIDDEN으로 이동**한 뒤에만 embed 코드를 삭제해야 lint가 잔존 코드를 잡아준다.
- `packages/auth/rbac.ts`의 sensitivity 정책은 **tool-wrapper 레벨에서 똑같이 강제**되어야 한다. LLM이 tool을 호출할 때 session permissions가 미충족이면 tool이 해당 페이지를 반환하지 말 것.
- `wiki-fs`는 git 저장소 — 파괴적 수정 금지, 오직 LLM이 ingest 경로로만 쓴다
- 기존 Ask AI 세션(`ask_conversation` / `ask_message`)은 보존 — DB 스키마는 유지, 내부 generation 로직만 교체
- `FEATURE_PAGE_FIRST_QUERY` 플래그는 Harness 전환 후 제거 (Karpathy page-first가 기본)

---

## Scope

### In scope

- **Ask AI agent 재작성**: `packages/ai/ask.ts` → tool-use loop (Vercel AI SDK)
- **4개 tool 구현**: `wiki-grep` · `wiki-read` · `wiki-follow-link` · `wiki-graph-query`
- **sensitivity tool-wrapper**: 모든 tool 호출은 session.permissions 기반 필터 적용
- **`wiki/index.md` 자동 유지**: ingest 시 LLM이 갱신 (Karpathy §indexing)
- **`wiki/log.md` append-only**: ingest/query/lint 이벤트 누적 (Karpathy §logging)
- **embedding 파이프라인 전면 삭제**: `embed.ts`, `embed_cache`, 3개 테이블의 `embedding` 컬럼, HNSW 인덱스, `search-embedder.ts`, `worker/jobs/embed.ts`
- **검색 코드 단순화**: `pg-search.ts`/`precedent-search.ts` BM25/trigram만 유지
- **정책·lint 업데이트**: `text-embedding-3-small` FORBIDDEN 이동
- **AGENTS.md §Ask AI workflow**: 탐색 규칙 명시
- **Graphify 상시 작동 훅 확인/강화**

### Out of scope (explicit)

- **multi-provider**: 별도 PR `feat/llm-multi-provider` 에서 처리 (병렬 가능 — embed 외 영역)
- **ingest 4단계 파이프라인 재작성**: `apps/worker/src/jobs/ingest/*` 는 이미 Karpathy 스타일. 그대로 유지. 단 generate.ts에서 `embedding: await generateEmbedding(...)` 호출부는 제거
- **위키 UI(`/wiki/default/:slug`)**: 변경 없음
- **`ask_conversation` / `ask_message` 스키마**: 변경 없음. context gauge(토큰 게이지)도 그대로 작동
- **Obsidian 등 외부 툴 통합**: 향후 과제
- **대규모 페이지(100k+) 스케일 최적화**: 현재 1.3k 규모 기준. 확장은 나중 문제
- **Claim 테이블 제거**: `knowledge_claim.embedding`만 제거하고 claim 자체는 보존 (page-first 이전 단계 데이터)

---

## File Structure

### New files

```
wiki/
  index.md                        # Karpathy §indexing — 카탈로그 (LLM 자동 유지)
  log.md                          # Karpathy §logging — append-only timeline

packages/ai/agent/
  ask-agent.ts                    # tool-use loop (plan → tool → synthesize)
  tools/
    types.ts                      # ToolDefinition / ToolResult / ToolContext
    wiki-grep.ts                  # slug · title · frontmatter · content 검색
    wiki-read.ts                  # slug → 전체 페이지 content
    wiki-follow-link.ts           # [[wikilink]] 추적
    wiki-graph-query.ts           # graphify graph.json query wrapper
    sensitivity-filter.ts         # session.permissions 기반 wrapper
    __tests__/wiki-grep.test.ts
    __tests__/wiki-read.test.ts
    __tests__/wiki-follow-link.test.ts
    __tests__/wiki-graph-query.test.ts
    __tests__/sensitivity-filter.test.ts
  __tests__/ask-agent.test.ts
  __tests__/ask-agent.integration.test.ts

packages/wiki-agent/
  maintain-index.ts               # wiki/index.md 생성/갱신 로직
  append-log.ts                   # wiki/log.md append helper
  __tests__/maintain-index.test.ts
  __tests__/append-log.test.ts

packages/db/drizzle/
  0037_drop_embedding_columns.sql # knowledge_page/claim/precedent_case.embedding + HNSW drop
  0038_drop_embed_cache.sql       # embed_cache 테이블 drop
```

### Deleted files

```
packages/ai/embed.ts                          # OpenAI embedding 래퍼
packages/ai/__tests__/embed.test.ts
packages/db/schema/embed-cache.ts
apps/worker/src/jobs/embed.ts                 # 배치 embed job
apps/worker/src/jobs/__tests__/embed.test.ts
apps/web/lib/server/search-embedder.ts        # 검색어 embed
apps/web/lib/server/__tests__/search-embedder.test.ts
```

### Modified files

| Path | Change |
|------|--------|
| `packages/ai/ask.ts` | 전면 재작성 — tool-use agent 호출부로 대체. 기존 6-lane router → agent.plan() 내부로 흡수. `generateEmbedding` import 제거 |
| `packages/ai/page-first/index.ts`, `page-first/synthesize.ts` | `wiki-grep`/`wiki-read` tool 내부로 흡수되거나 그대로 호출. embedding 의존 있으면 제거 |
| `packages/ai/case-context.ts` | 벡터 검색 제거 → BM25/trigram 또는 `wiki-grep` 재사용 |
| `packages/ai/graph-context.ts` | 유지 — graphify 기반이라 embedding 무관 |
| `packages/ai/router.ts` | 단순화 or 삭제 — agent.plan() 이 자체 라우팅 |
| `packages/ai/provider.ts` | 유지 (multi-provider PR에서 교체 예정) |
| `packages/search/pg-search.ts` | 벡터 검색 섹션 완전 제거. BM25 + pg_trgm 유사도만 |
| `packages/search/precedent-search.ts` | 동일 |
| `packages/db/schema/knowledge.ts` | `embedding`, `last_embedded_at` 컬럼 제거 (knowledge_page, knowledge_claim) |
| `packages/db/schema/case.ts` | `precedent_case.embedding` 컬럼 제거 |
| `packages/db/schema/index.ts` | `embed-cache` re-export 제거 |
| `apps/web/app/api/search/route.ts` | `embedSearchQuery` 호출 제거. BM25/trigram 쿼리만 |
| `apps/web/lib/queries/precedent-search.ts` | 동일 |
| `apps/web/lib/queries/search.ts` | 동일 |
| `apps/worker/src/index.ts` | `embedHandler` 등록 제거 |
| `apps/worker/src/jobs/ingest/generate.ts` | `embedding: await generateEmbedding(...)` 호출부 제거 |
| `apps/worker/src/jobs/ingest/analyze.ts` | embed 관련 코드 제거 |
| `apps/worker/src/jobs/compile.ts` | 동일 |
| `apps/worker/src/jobs/cache-cleanup.ts` | `embed_cache` 정리 로직 제거 |
| `docs/policies/llm-models.md` | §1.4 임베딩 모델 금지 확정. `text-embedding-3-small` FORBIDDEN 이동 |
| `scripts/check-llm-models.mjs` | `text-embedding-3-small` 를 FORBIDDEN 패턴으로 이동 |
| `AGENTS.md` | §Ask AI workflow 섹션 추가. tool-use 탐색 규칙 명시 |
| `CLAUDE.md` | 변경 이력 entry 추가 |
| `README.md` §6, §6.5 | embedding 제거 · tool-use agent 구조 반영 |
| `apps/web/messages/ko.json`, `en.json` | 필요 시 agent 진행 상태 라벨 추가 (`Ask.agent.searching` 등) |

---

## Phases (execution order)

- **Phase A** (2d): Agent infra — tool types + 4개 tool + sensitivity wrapper
- **Phase B** (2d): Ask AI agent 재작성 (tool-use loop + streaming)
- **Phase C** (1d): `wiki/index.md` + `wiki/log.md` 자동 유지
- **Phase D** (1d): 정책·lint 선행 — `text-embedding-3-small` FORBIDDEN 이동 (Phase E 시작 게이트)
- **Phase E** (1.5d): Embedding 파이프라인 파괴적 삭제 (migration 0037+0038 + 파일 삭제)
- **Phase F** (1d): 검색 코드 BM25/trigram 정리
- **Phase G** (1d): 통합 테스트 + AGENTS.md + README + PR

**Phase 순서 이유:**
- A → B: agent는 tool 먼저 존재해야 구현 가능
- A/B는 기존 embed 코드에 영향 주지 않음 — 파괴적 변경 전 agent가 동작 가능해야 함
- D → E: lint가 금지로 바뀌어야 E에서 "잔존 embed 코드"를 자동 감지
- E → F: 컬럼이 드롭되어야 search 코드에서 안전하게 제거 가능
- G는 마지막

**병렬 가능:**
- Phase A 내 A2~A5 tool 구현은 subagent로 병렬 디스패치 OK
- Phase D와 A/B는 파일 영역이 달라 병렬 가능
- multi-provider PR(`feat/llm-multi-provider`)과 전체 병렬 가능

---

## Phase A: Agent Infra (2 days)

### Task A1: Tool types

**Files:**
- Create: `packages/ai/agent/tools/types.ts`
- Create: `packages/ai/agent/tools/__tests__/types.test.ts`

- [ ] **Step 1: Write failing type test**

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { ToolDefinition, ToolResult, ToolContext } from "../types";

describe("tool types", () => {
  it("ToolContext carries session info", () => {
    expectTypeOf<ToolContext["workspaceId"]>().toBeString();
    expectTypeOf<ToolContext["userId"]>().toBeString();
    expectTypeOf<ToolContext["permissions"]>().toEqualTypeOf<string[]>();
  });
  it("ToolResult is JSON-serializable shape", () => {
    type R = ToolResult;
    expectTypeOf<R["ok"]>().toBeBoolean();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/ai/agent/tools/types.ts
export interface ToolContext {
  workspaceId: string;
  userId: string;
  permissions: string[];         // session.permissions — sensitivity 필터에 사용
  conversationId?: string;       // 로깅/디버깅용
}

export interface ToolDefinition<Input, Output> {
  name: string;                  // e.g. "wiki-grep"
  description: string;           // LLM이 보는 설명 (한국어 OK)
  parameters: Record<string, unknown>;  // JSON Schema
  execute(input: Input, ctx: ToolContext): Promise<ToolResult<Output>>;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "not_found" | "forbidden" | "invalid" | "timeout" | "unknown" };
```

- [ ] **Step 3: Commit** — `feat(ai/agent): tool types + context shape`

---

### Task A2: `wiki-grep` tool

**Goal:** slug · title · frontmatter · content 영역에서 키워드 매칭. LLM이 여러 번 호출할 것을 가정해 **결과를 slug+title+snippet만** 반환 (read로 분리).

**Files:**
- Create: `packages/ai/agent/tools/wiki-grep.ts`
- Create: `packages/ai/agent/tools/__tests__/wiki-grep.test.ts`

**Input schema:**
```json
{
  "query": "사내대출 이자 한도",
  "scope": "all" | "manual" | "auto" | "procedures",    // optional
  "limit": 10                                            // default 10, max 30
}
```

**Output:**
```json
{
  "matches": [
    {
      "slug": "loan-interest-limit",
      "title": "사내대출 이자 한도",
      "path": "wiki/jarvis/manual/policies/loan-interest-limit.md",
      "sensitivity": "INTERNAL",
      "snippet": "...year=2026 limit=5억원..."
    }
  ]
}
```

- [ ] **Step 1: Write failing tests**

Scenarios:
- matches by title keyword
- matches by content keyword
- respects `scope` filter (auto/manual/procedures)
- returns at most `limit` results
- sensitivity filter: `SECRET_REF_ONLY` 페이지는 permissions 미충족 시 제외
- returns `{ok:true, data:{matches:[]}}` on no match (not error)

- [ ] **Step 2: Implementation**

```ts
// packages/ai/agent/tools/wiki-grep.ts
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { buildLegacyKnowledgeSensitivitySqlFilter } from "@jarvis/auth/rbac";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";

interface WikiGrepInput { query: string; scope?: string; limit?: number; }
interface WikiGrepMatch { slug: string; title: string; path: string; sensitivity: string; snippet: string; }
interface WikiGrepOutput { matches: WikiGrepMatch[]; }

export const wikiGrep: ToolDefinition<WikiGrepInput, WikiGrepOutput> = {
  name: "wiki-grep",
  description: "위키 페이지를 키워드로 검색. slug·title·frontmatter·content 모두 매칭. 본문이 필요하면 wiki-read로 후속 호출.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "검색어 (한국어/영어 OK)" },
      scope: { type: "string", enum: ["all", "manual", "auto", "procedures"] },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
    },
  },
  async execute({ query, scope = "all", limit = 10 }, ctx) {
    if (!query || query.trim().length < 2) {
      return { ok: false, error: "query too short", code: "invalid" };
    }
    const q = query.trim();
    const sensitivityFilter = buildLegacyKnowledgeSensitivitySqlFilter(ctx.permissions, wikiPageIndex);
    const scopeFilter = scope === "all" ? sql`true` : ilike(wikiPageIndex.path, `wiki/jarvis/${scope}/%`);
    const titleMatch = ilike(wikiPageIndex.title, `%${q}%`);
    const slugMatch = ilike(wikiPageIndex.slug, `%${q}%`);
    // content 매칭은 pg_trgm 기반 — search_vector가 있으면 그걸 쓴다
    // (wiki-fs 파일 직접 grep은 Phase A3에서 wiki-read와 공유)
    const rows = await db
      .select({
        slug: wikiPageIndex.slug,
        title: wikiPageIndex.title,
        path: wikiPageIndex.path,
        sensitivity: wikiPageIndex.sensitivity,
      })
      .from(wikiPageIndex)
      .where(and(or(titleMatch, slugMatch), scopeFilter, sensitivityFilter))
      .limit(limit);
    return {
      ok: true,
      data: {
        matches: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          path: r.path,
          sensitivity: r.sensitivity,
          snippet: "",  // Phase A3에서 wiki-fs 파일 읽어 채움 or tsvector headline
        })),
      },
    };
  },
};
```

- [ ] **Step 3: Enrich snippet** — tsvector `ts_headline` 또는 wiki-fs 파일의 첫 200자로 snippet 생성
- [ ] **Step 4: Verify + commit** — `feat(ai/agent): wiki-grep tool`

---

### Task A3: `wiki-read` tool

**Goal:** slug로 페이지 전체 content 반환. sensitivity 확인 후.

**Files:**
- Create: `packages/ai/agent/tools/wiki-read.ts`
- Create: `packages/ai/agent/tools/__tests__/wiki-read.test.ts`

**Input:** `{ "slug": "loan-interest-limit" }`
**Output:** `{ "slug", "title", "path", "sensitivity", "frontmatter", "content", "outbound_wikilinks": ["..."] }`

- [ ] **Step 1: Failing tests** — slug hit, slug miss, sensitivity forbidden, outbound_wikilinks 파싱
- [ ] **Step 2: Implementation** — `wikiPageIndex`에서 path 얻어 `wiki-fs`로 실제 md 읽기. frontmatter는 gray-matter. wikilinks는 `/\[\[([^\]]+)\]\]/g` 정규식
- [ ] **Step 3: Commit** — `feat(ai/agent): wiki-read tool`

---

### Task A4: `wiki-follow-link` tool

**Goal:** 현재 slug에서 연결된 다른 페이지 slug 목록. 1-hop만 (깊이는 LLM이 반복 호출).

**Files:**
- Create: `packages/ai/agent/tools/wiki-follow-link.ts`
- Test: `packages/ai/agent/tools/__tests__/wiki-follow-link.test.ts`

**Input:** `{ "from_slug": "loan-interest-limit", "direction": "outbound" | "inbound" | "both" }`
**Output:** `{ "links": [{ "slug", "title", "direction" }] }`

- [ ] Reuses `packages/wiki-fs/wikilink` existing resolver
- [ ] inbound는 wiki-fs가 이미 유지하는 backlink 인덱스 활용
- [ ] Commit — `feat(ai/agent): wiki-follow-link tool`

---

### Task A5: `wiki-graph-query` tool

**Goal:** graphify가 만든 `graphify-out/graph.json` 에 대한 쿼리 wrapper. 의미 유사성 edge · 커뮤니티 · 갓 노드 탐색.

**Files:**
- Create: `packages/ai/agent/tools/wiki-graph-query.ts`
- Test: `packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts`

**Input:** `{ "mode": "neighbors" | "path" | "community", "node": "...", "target"?: "...", "budget"?: 1500 }`
**Output:** `{ "nodes": [...], "edges": [...] }`

- [ ] Option A: shell out to `graphify query` CLI (현재 스킬 방식)
- [ ] Option B: MCP server 연동 (더 타이트한 통합)
- [ ] **권장: A로 시작** (단순). 1,331페이지 규모라 CLI 호출 <500ms면 충분
- [ ] sensitivity: graph.json에 sensitivity meta 포함되도록 graphify 호출 시 inject 필요할 수 있음 (future work — 일단 page-level 필터는 wiki-grep/read가 담당)
- [ ] Commit — `feat(ai/agent): wiki-graph-query tool`

---

### Task A6: sensitivity wrapper

**Goal:** tool 등록 시점에 permissions 기반 wrapper를 강제. LLM이 어떤 tool을 호출하든 workspace + sensitivity 체크가 적용된다.

**Files:**
- Create: `packages/ai/agent/tools/sensitivity-filter.ts`
- Test: `packages/ai/agent/tools/__tests__/sensitivity-filter.test.ts`

```ts
export function withSensitivityFilter<I, O>(
  tool: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return {
    ...tool,
    async execute(input, ctx) {
      const r = await tool.execute(input, ctx);
      if (!r.ok) return r;
      // Output 내 sensitivity 필드가 있으면 permissions와 대조, 없으면 wiki-grep/read가 자체 필터링한 결과로 간주
      return r;
    },
  };
}
```

- [ ] 실제 필터는 각 tool 내부 SQL에서 이미 하므로, wrapper는 **방어선(belt-and-suspenders)** 역할. 로깅도 이 레이어에서
- [ ] Commit — `feat(ai/agent): sensitivity tool wrapper + logging`

---

**Phase A gate:** 4개 tool + wrapper 전부 단위 테스트 green. `pnpm --filter @jarvis/ai test agent/tools` PASS. Tag `phase-harness-a-complete`.

---

## Phase B: Ask AI agent 재작성 (2 days)

### Task B1: ask-agent 구조 + plan loop

**Files:**
- Create: `packages/ai/agent/ask-agent.ts`
- Test: `packages/ai/agent/__tests__/ask-agent.test.ts`

**Flow:**
1. 질문 입력
2. system prompt에 tools 설명 + index.md 요약(optional) 첨부
3. LLM이 tool call을 반환 → execute → 결과를 messages에 append
4. 반복 (max 8 tool calls, 아니면 abort)
5. LLM이 tool call 없이 답변만 반환하면 종료
6. 답변 + 사용된 tool 로그 + citations 반환

**사용 SDK:** Vercel AI SDK `generateText` / `streamText` with `tools: {...}`.

- [ ] **Step 1: Failing test** — mock LLM이 2회 tool call 후 답변 반환하는 시나리오에서 agent가 올바르게 loop 수행
- [ ] **Step 2: Implementation**

```ts
// packages/ai/agent/ask-agent.ts
import { streamText, tool } from "ai";
import { wikiGrep, wikiRead, wikiFollowLink, wikiGraphQuery } from "./tools";
import { withSensitivityFilter } from "./tools/sensitivity-filter";
import type { ToolContext } from "./tools/types";
import type { SourceRef, SSEEvent } from "../types";

const MAX_TOOL_CALLS = 8;

export async function* askAgent(
  question: string,
  ctx: ToolContext,
): AsyncGenerator<SSEEvent> {
  const tools = {
    wiki_grep: toAiSdkTool(withSensitivityFilter(wikiGrep), ctx),
    wiki_read: toAiSdkTool(withSensitivityFilter(wikiRead), ctx),
    wiki_follow_link: toAiSdkTool(withSensitivityFilter(wikiFollowLink), ctx),
    wiki_graph_query: toAiSdkTool(withSensitivityFilter(wikiGraphQuery), ctx),
  };

  const result = streamText({
    model: getModel(ctx),  // 현재 provider.ts 그대로
    system: ASK_SYSTEM_PROMPT,
    prompt: question,
    tools,
    maxSteps: MAX_TOOL_CALLS,
  });

  // SSE 이벤트 생성 — tool-call / tool-result / delta / sources / done
  for await (const part of result.fullStream) {
    yield toSSE(part);
  }
}

const ASK_SYSTEM_PROMPT = `
당신은 Jarvis 사내 위키를 탐색해 질문에 답하는 어시스턴트입니다.
- 먼저 wiki-grep으로 관련 페이지를 찾고, wiki-read로 본문을 읽어 답하세요.
- 관련 개념이 있으면 wiki-follow-link 또는 wiki-graph-query로 확장합니다.
- 답변에는 \`[[slug]]\` 형식의 citation을 인용하세요.
- 근거가 없으면 추측하지 말고 "문서에 없다"고 답하세요.
- 최대 ${MAX_TOOL_CALLS}회까지 tool을 호출할 수 있습니다.
`;
```

- [ ] **Step 3: Verify + commit** — `feat(ai/agent): ask-agent tool-use loop`

---

### Task B2: Streaming + tool progress SSE

**Goal:** UI에서 "위키 검색 중… · 3건 매칭" 같은 진행 상태 노출.

- [ ] SSE event 추가: `{type:"tool-call", name:"wiki-grep", input:{...}}`, `{type:"tool-result", summary:"3 pages"}`
- [ ] `apps/web/components/ai/AskPanel.tsx` — GlobeLoader 라벨에 tool 진행 상태 반영 (`useAskAI` hook 확장)
- [ ] 본문 citation 렌더는 기존 로직 그대로 (`ClaimBadge` / `SourceRefCard` + WikiPageSection)
- [ ] Commit — `feat(ask): stream tool progress to UI`

---

### Task B3: `ask.ts` 교체

**Files:**
- Modify: `packages/ai/ask.ts` — 기존 6-lane router + page-first 구조를 agent 호출로 대체
- Delete tests that assert embedding-based retrieval

- [ ] Keep: `logLlmCall`, `assertBudget`, `makeCacheKey/getCached/setCached`, `recordBlocked` wiring
- [ ] Replace: `retrieveRelevantCases`, `retrieveRelevantGraphContext`, `searchDirectory` → agent tool calls
- [ ] Remove: `generateEmbedding` import, router.ts 호출
- [ ] `router.ts` 삭제 or deprecated
- [ ] Commit — `refactor(ai): ask.ts delegates to ask-agent (tool-use)`

---

### Task B4: ClaimBadge + citation 호환성

- [ ] 기존 `[source:1]` 포맷 대신 `[[slug]]` 포맷을 LLM이 그대로 생성하도록 prompt에서 강제
- [ ] `AnswerCard` / `ClaimBadge` 가 `[[slug]]` 를 기존 처럼 렌더하도록 확인 (이미 됨 — `citation: "[[slug]]"` 필드)
- [ ] Commit — `refactor(ask): unify citation format to [[slug]]`

---

**Phase B gate:** ask-agent 통합 테스트 (real DB, mock LLM) PASS. AskPanel dev 서버에서 질문 → tool call 로그 확인 가능. Tag `phase-harness-b-complete`.

---

## Phase C: wiki/index.md + wiki/log.md (1 day)

### Task C1: maintain-index.ts

**Files:**
- Create: `packages/wiki-agent/maintain-index.ts`
- Test: `packages/wiki-agent/__tests__/maintain-index.test.ts`

**Logic:**
- 모든 wiki page를 스캔 (wiki-fs)
- 카테고리별(manual/auto/procedures/references 등) 그룹
- 각 페이지 `[[slug]]` + title + 1-line summary (frontmatter `summary` 또는 문서 첫 줄)
- output: `wiki/index.md`
- frontmatter `generated_at` + `page_count`

- [ ] **Step 1: Failing test** — 3개 fixture 페이지로 index.md 생성 확인
- [ ] **Step 2: Implementation**
- [ ] **Step 3: Hook into ingest pipeline** — `apps/worker/src/jobs/ingest/write-and-commit.ts` 끝에서 호출
- [ ] **Step 4: Manual bootstrap** — 초기 1회 `pnpm wiki:regen-index` CLI로 실행
- [ ] Commit — `feat(wiki-agent): maintain index.md catalog`

---

### Task C2: append-log.ts

**Files:**
- Create: `packages/wiki-agent/append-log.ts`
- Test: `packages/wiki-agent/__tests__/append-log.test.ts`

**Format** (Karpathy 원문 권장):
```md
## [2026-04-23] ingest | 사내대출 이자 한도 개정
- Source: raw/loan-policy-2026-04.pdf
- Updated: [[loan-interest-limit]], [[welfare-loan-overview]]
- Lint: 0 contradictions, 1 new orphan resolved
```

- [ ] Event type: `ingest` | `query` | `lint` | `graph-build`
- [ ] `grep "^## \[" log.md | tail -5` 가능한 파싱 가능성 유지
- [ ] Call sites:
  - ingest: `write-and-commit.ts` 마지막
  - query: ask-agent 완료 후 (옵션 — 로그 폭증 주의, 일단 OFF)
  - lint: wiki-lint job 완료 후
  - graph-build: `graphify` post-run hook
- [ ] Commit — `feat(wiki-agent): append-only log.md`

---

**Phase C gate:** wiki/index.md 초기 생성 + log.md 첫 엔트리 추가 확인. Tag `phase-harness-c-complete`.

---

## Phase D: 정책·lint 선행 (1 day)

### Task D1: Update `docs/policies/llm-models.md`

- [ ] §1 허용 모델에서 `text-embedding-3-small` 완전 제거
- [ ] §2 금지 모델에 `text-embedding-3-small` + 전 embedding 계열 명시
- [ ] §7 변경 이력: `| 2026-04-23 | Harness-first 전환으로 embedding 모델 전면 금지 | feat/ask-harness-transition |`
- [ ] Commit — `docs(policy): forbid all embedding models post-Harness transition`

### Task D2: `scripts/check-llm-models.mjs`

- [ ] `text-embedding-3-small` 을 ALLOWED에서 FORBIDDEN 으로 이동
- [ ] 검증: `node scripts/check-llm-models.mjs` — 현재 embed.ts 등에서 violation 발견될 것 (Phase E에서 삭제됨)
- [ ] **이 시점에는 lint가 fail한다**. 계속 진행
- [ ] Commit — `feat(lint): move text-embedding-3-small to FORBIDDEN`

---

**Phase D gate:** 의도적으로 lint fail 상태. 다음 Phase에서 해결.

---

## Phase E: Embedding 파이프라인 파괴적 삭제 (1.5 days)

### Task E1: Migration 0037 — drop embedding columns + HNSW

**Files:**
- Create: `packages/db/drizzle/0037_drop_embedding_columns.sql`

```sql
-- Phase-Harness E1: embedding 파이프라인 폐지.
DROP INDEX IF EXISTS knowledge_page_embedding_hnsw_idx;
DROP INDEX IF EXISTS knowledge_claim_embedding_hnsw_idx;
DROP INDEX IF EXISTS precedent_case_embedding_hnsw_idx;

ALTER TABLE knowledge_page   DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_page   DROP COLUMN IF EXISTS last_embedded_at;
ALTER TABLE knowledge_claim  DROP COLUMN IF EXISTS embedding;
ALTER TABLE precedent_case   DROP COLUMN IF EXISTS embedding;
```

- [ ] `_journal.json` 업데이트
- [ ] Drizzle schema 파일에서 해당 컬럼 제거 (knowledge.ts, case.ts)
- [ ] `pnpm db:migrate` 로컬 적용 + `pnpm db:generate` drift 확인
- [ ] `node scripts/check-schema-drift.mjs --precommit` PASS 확인
- [ ] Commit — `feat(db): migration 0037 — drop embedding columns + HNSW`

### Task E2: Migration 0038 — drop embed_cache

```sql
DROP TABLE IF EXISTS embed_cache CASCADE;
```

- [ ] Commit — `feat(db): migration 0038 — drop embed_cache table`

### Task E3: 파일 삭제

- [ ] Delete: `packages/ai/embed.ts`, `packages/ai/__tests__/embed.test.ts`
- [ ] Delete: `packages/db/schema/embed-cache.ts`, `packages/db/schema/index.ts` 에서 export 제거
- [ ] Delete: `apps/worker/src/jobs/embed.ts`, test 파일
- [ ] Delete: `apps/web/lib/server/search-embedder.ts`, test 파일
- [ ] `apps/worker/src/index.ts` 에서 `embedHandler` 등록 라인 제거
- [ ] Commit — `chore(embed): delete embedding pipeline entirely`

### Task E4: ingest 파이프라인 embed 호출 제거

- [ ] `apps/worker/src/jobs/ingest/generate.ts` — `embedding: await generateEmbedding(...)` 라인 제거
- [ ] `apps/worker/src/jobs/ingest/analyze.ts` — embed import 제거
- [ ] `apps/worker/src/jobs/compile.ts` — 동일
- [ ] `apps/worker/src/jobs/cache-cleanup.ts` — embed_cache 정리 로직 제거
- [ ] Verify: `pnpm build` + worker 기동 smoke test
- [ ] Commit — `refactor(worker): remove embed calls from ingest/compile`

---

**Phase E gate:** `node scripts/check-llm-models.mjs` 다시 PASS (embed 호출부 0). `pnpm --filter @jarvis/web type-check` PASS. `pnpm db:migrate` 완료. Tag `phase-harness-e-complete`.

---

## Phase F: 검색 코드 정리 (1 day)

### Task F1: `packages/search/pg-search.ts`

- [ ] 벡터 거리 계산(`embedding <=> $1`) 섹션 완전 제거
- [ ] BM25 + pg_trgm 유사도 기반 쿼리만 유지
- [ ] search_vector 인덱스 유지
- [ ] Test 업데이트
- [ ] Commit — `refactor(search): drop vector search, keep BM25 + trigram`

### Task F2: `packages/search/precedent-search.ts`

- [ ] 동일 — 벡터 제거, BM25만
- [ ] Commit

### Task F3: API/쿼리 사이트

- [ ] `apps/web/app/api/search/route.ts` — `embedSearchQuery` 호출 제거
- [ ] `apps/web/lib/queries/precedent-search.ts` — 동일
- [ ] `apps/web/lib/queries/search.ts` — 동일
- [ ] `packages/ai/case-context.ts` — `generateEmbedding` 호출 제거, BM25 fallback (또는 ask-agent에 합류)
- [ ] `packages/ai/graph-context.ts` — 유지 (graphify 기반, embed 무관)
- [ ] Commit per file — `refactor(<file>): drop embedding retrieval`

---

**Phase F gate:** `pnpm test` 전체 PASS. `pnpm --filter @jarvis/web exec playwright test e2e/ask.spec.ts` PASS (ask가 agent로 동작). Tag `phase-harness-f-complete`.

---

## Phase G: 통합 테스트 + 문서 + Release (1 day)

### Task G1: E2E 시나리오

- [ ] Ask 질문 → tool-call 로그 기록 → 답변 + [[slug]] citation 렌더 + 컨텍스트 게이지 갱신
- [ ] Sensitivity: 권한 없는 사용자가 SECRET 페이지 관련 질문 → 답변에 포함 안 됨 확인
- [ ] Long session: 8 tool call 초과 시 abort + 경고
- [ ] Commit — `test(e2e): ask-agent harness scenarios`

### Task G2: AGENTS.md §Ask AI workflow

```markdown
## Ask AI workflow (Harness-first)

Ask AI는 embedding RAG 대신 tool-use agent로 동작합니다.

### 도구
- `wiki-grep` — 키워드로 페이지 후보 찾기 (제목/slug/content)
- `wiki-read` — slug로 본문 읽기
- `wiki-follow-link` — 1-hop wikilink 추적
- `wiki-graph-query` — graphify 그래프 쿼리 (커뮤니티/경로)

### 탐색 규칙
1. 먼저 `wiki-grep` 으로 3~5개 후보를 얻는다
2. top 1~2개를 `wiki-read` 로 읽는다
3. 답이 충분치 않으면 `wiki-follow-link` 또는 `wiki-graph-query` 로 확장
4. 최대 8회 tool call. 넘으면 abort
5. 답변에는 `[[slug]]` 형식 citation 필수
6. 근거 부족 시 "문서에 없다"고 응답 (추측 금지)

### 상시 작동 훅
- `/graphify` 실행 → `graphify-out/GRAPH_REPORT.md` 생성
- Ask AI의 `wiki-graph-query` 는 이 산출물을 활용
- AGENTS.md 상단에 "Ask AI workflow" 링크 유지
```

- [ ] Commit — `docs(agents): add Ask AI Harness workflow`

### Task G3: CLAUDE.md 변경 이력

- [ ] Entry: `2026-04-23 | Harness-first Ask AI 전환. embedding 파이프라인 전면 제거, tool-use agent 도입 | ... |`
- [ ] jarvis-architecture 스킬 업데이트 — pipeline 섹션 재작성
- [ ] Commit — `docs(claude): reflect Harness-first transition in changelog`

### Task G4: README.md

- [ ] §6 tech stack — pgvector/HNSW 제거, graphify 추가 (이미 있으면 위상 승격)
- [ ] §6.5 policy — embedding 금지 명시
- [ ] Commit

### Task G5: Final sweep + PR

- [ ] `pnpm --filter @jarvis/web type-check` · `lint` · `test` 전체
- [ ] `node scripts/check-llm-models.mjs` — 0 violations
- [ ] `node scripts/check-schema-drift.mjs --precommit` — 0 drift
- [ ] `pnpm wiki:check` PASS (orphans/contradictions)
- [ ] `pnpm audit:rsc` PASS
- [ ] `pnpm eval:budget-test` (AI 파이프라인 바뀌었으므로 필수)
- [ ] PR 생성: `feat: Ask AI Harness-first transition — drop embedding, adopt tool-use agent`

---

## Summary

- Ask AI 가 **LLM 탐색 agent**로 전환 (Karpathy LLM Wiki 패턴)
- 4개 tool: wiki-grep · wiki-read · wiki-follow-link · wiki-graph-query
- sensitivity 필터는 tool-wrapper 레벨에서 강제
- `wiki/index.md` + `wiki/log.md` 자동 유지
- Embedding 파이프라인 전량 삭제 (files + DB columns + cache + HNSW)
- pgvector 의존 제거
- 검색 코드는 BM25 + pg_trgm 로 단순화

## Breaking changes

- `knowledge_page.embedding`, `knowledge_claim.embedding`, `precedent_case.embedding` 컬럼 **DROP**
- `embed_cache` 테이블 **DROP**
- `packages/ai/embed.ts`, `search-embedder.ts`, worker `jobs/embed.ts` **DELETED**
- `text-embedding-3-small` 모델 **FORBIDDEN**
- Ask AI 응답 레이턴시: 기존 2~3초 → 5~15초 (tool call 3~7회). UI에 progress 표시로 커버.
- `FEATURE_PAGE_FIRST_QUERY` 플래그 **REMOVED** (Harness가 기본)

## Test plan

- [x] unit: 4 tools + sensitivity wrapper + ask-agent
- [x] integration: ask-agent with real DB + mock LLM (tool-call chain)
- [ ] e2e: Playwright — ask 세션 + citation + sensitivity 격리
- [ ] manual QA staging: 1.3k 페이지에서 실 질문 10건 레이턴시/정확도 측정

## Self-Review Checklist

Before executing, verify this plan against the spec:

- [x] **Karpathy LLM Wiki 3 layers** — Raw(wiki/raw), Wiki(wiki/**/*.md), Schema(AGENTS.md §Ask AI) 모두 존재
- [x] **3 operations** — Ingest(기존 pipeline), Query(ask-agent), Lint(wiki-lint 기존)
- [x] **index.md + log.md** — Phase C에서 자동 유지
- [x] **graphify 통합** — wiki-graph-query tool로 활용
- [x] **sensitivity 격리** — tool-wrapper + 각 tool 내부 SQL 필터
- [x] **파괴적 마이그레이션** — Phase D 선행으로 lint가 잔존 코드 감지
- [x] **multi-provider 병렬 가능** — 영역 분리 (embed vs chat/stream)
- [x] **UI 변경 최소** — 기존 AskPanel/AnswerCard 재사용, tool progress만 추가

## Execution Handoff

**When you open a new session:**

1. Read "Context for New Session" section top of this file
2. Create worktree per "Start commands" block
3. Start with **Phase A, Task A1** — TDD: test → fail → implement → pass → commit
4. Gate check between phases — do not start Phase B until Phase A gate passes
5. **Phase D 선행 원칙**: Phase E 시작 전 반드시 D 완료 (lint가 잔존 embed 코드를 감지하도록)
6. For execution automation, invoke **`superpowers:subagent-driven-development`** — dispatch fresh subagent per Task with two-stage review

**Known risks:**

- **레이턴시 증가**: tool call 반복으로 5~15초. UI progress 안 보이면 사용자 이탈 위험. B2 필수.
- **키워드 의존성**: grep 못 잡으면 답 미스. wikilinks + frontmatter aliases로 완화. graphify semantic edges가 보조.
- **LLM 비용 증가**: 쿼리당 3~7회 호출. gpt-5.4-mini 기준 월 $10~30 (embed 비용 절감과 상쇄 이상).
- **sensitivity 누수**: tool-level 필터 실수 시 심각. Phase A6 + E2E 테스트 필수.
- **Migration 실패 시 롤백**: 0037/0038은 데이터 손실. staging에서 먼저 적용. 프로덕션은 DB 스냅샷 선행.

**Follow-up (out of this plan):**

- Ask AI filing — 답변을 `wiki/` 에 새 페이지로 저장 (Karpathy 원문 §Query 의 "file back into the wiki")
- Obsidian 통합 (선택)
- 10k+ 페이지 스케일 최적화 — BM25 가속 또는 그래프 기반 1차 필터
