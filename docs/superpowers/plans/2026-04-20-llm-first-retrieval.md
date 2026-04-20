# LLM-first Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement LLM-first page shortlist (Karpathy page-first 교정) — shortlist 주체를 SQL에서 LLM으로 이동, DB는 RBAC 게이트로 축소. CLIProxy 구독 경로 활성, EHR Graphify 수동 import, 기존 legacy SQL shortlist는 feature flag fallback으로 유지.

**Architecture:** `pageFirstAsk(query)` 파이프라인을 `domain-infer → catalog → llm-shortlist → read-pages → synthesize`로 재조립. `shortlist.ts`의 lexical 로직은 `legacyLexicalShortlist()`로 보존. 신규 3 파일(`catalog.ts`, `domain-infer.ts`, `llm-shortlist.ts`) + `index.ts` 재배선. 구독 경로는 `FEATURE_SUBSCRIPTION_QUERY=true` (provider.ts 기존 op-level routing). EHR Graphify는 수동 Path B로 진행하며 `scripts/graphify-postprocess.ts` + enrichment 프롬프트 제공.

**Tech Stack:** TypeScript 5, Next.js 15, Node ≥22, Drizzle ORM, Postgres (pgvector 확장 — 본 plan에서는 미사용), pg-boss, OpenAI SDK, CLIProxyAPI v6.9.29, tsx, vitest, zod.

**Spec reference:** [docs/superpowers/specs/2026-04-20-llm-first-retrieval-design.md](../specs/2026-04-20-llm-first-retrieval-design.md)

---

## File Structure

### Create
- `packages/ai/page-first/catalog.ts` — RBAC + domain 필터로 페이지 메타 조회 (renaming of shortlist.ts logic, 확장)
- `packages/ai/page-first/domain-infer.ts` — 질문 → domain 추정 (keyword table)
- `packages/ai/page-first/llm-shortlist.ts` — LLM이 catalog 보고 5-8 페이지 선택
- `packages/ai/page-first/__tests__/catalog.test.ts`
- `packages/ai/page-first/__tests__/domain-infer.test.ts`
- `packages/ai/page-first/__tests__/llm-shortlist.test.ts`
- `scripts/graphify-postprocess.ts` — Graphify raw output → Jarvis frontmatter 추가 + 모듈별 배치
- `scripts/tests/graphify-postprocess.test.ts`
- `prompts/enrichment/ehr-entity-enrichment.md` — LLM 의미 풍부화 프롬프트 (사용자가 실행용)
- `packages/db/schema/migrations/NNNN_add_wiki_page_snippet.sql` (drizzle-kit이 자동 생성)
- `apps/worker/eval/fixtures/2026-04/eval-031.md ~ eval-050.md` — A-20 추가 fixture 20개

### Modify
- `packages/ai/page-first/shortlist.ts` — 기존 `lexicalShortlist`를 `legacyLexicalShortlist`로 rename, export 유지
- `packages/ai/page-first/index.ts` — 파이프라인 재배선, `FEATURE_LLM_SHORTLIST` 분기
- `packages/db/schema/wiki-page-index.ts` — `snippet varchar(200)` 컬럼 추가
- `.env.example` — `FEATURE_LLM_SHORTLIST=false` 추가
- `apps/web/app/(app)/_components/Nav.tsx` (또는 유사 위치) — `/wiki/graph`, `/architecture` 링크 활성

---

## Critical Path Ordering

```
[Phase α critical path — 순차]
Task 1 (DB 준비) → Task 2 (build-wiki-index) → Task 3 (wiki-reproject) → Task 4 (CLIProxy gateway) → Task 5 (A-20 fixture) → Task 6 (baseline)
                                                                                           │
                 ┌────────────────────────────────────────────────────────────────────────┘
                 ▼
[Phase γ — 병렬 dispatch 가능]
Task 7 (catalog.ts)  │  Task 8 (domain-infer.ts)  │  Task 9 (llm-shortlist.ts)  │  Task 13 (UI /wiki/graph)  │  Task 14 (UI /architecture)
                 │                              │                              │
                 └──────────────────────────────┴──────────────────────────────┘
                                                │
                                                ▼
                                     Task 10 (index.ts 재배선, 병합)
                                                │
                                                ▼
                                     Task 11 (E2E 통합 test)
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
[Phase δ — 사용자 트랙 (Graphify)]                              [Phase γ 재측정]
Task 15 (graphify-postprocess 스크립트)                          Task 12 (C 활성 후 A-20)
Task 16 (enrichment prompt 문서)
(사용자가 Task 17 Graphify 실행)
Task 18 (reproject 재실행)
Task 19 (Code형 A-20 재측정)
                                                │
                                                ▼
[Phase ε — cleanup 병렬]
Task 20 (docs/data 정리) │ Task 21 (self-def drift) │ Task 22 (ask.ts 삭제) │ Task 23 (disposable docs 삭제)
```

---

## Task 1: DB 준비 — workspace 'jarvis' + snippet 컬럼

**Files:**
- Modify: `packages/db/schema/wiki-page-index.ts:62` (freshnessSlaDays 아래에 snippet 추가)
- Create: `packages/db/drizzle/NNNN_add_wiki_page_snippet.sql` (drizzle-kit 자동 생성)
- SQL: workspace INSERT (raw SQL, migration 아님 — seed-like)

- [ ] **Step 1: workspace 'jarvis' INSERT**

Run:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "INSERT INTO workspace (code, name) VALUES ('jarvis', 'Jarvis Pilot') ON CONFLICT (code) DO NOTHING RETURNING id, code;"
```
Expected:
```
                  id                  |  code
--------------------------------------+--------
 <new-uuid>                           | jarvis
(1 row)
```

- [ ] **Step 2: Drizzle schema에 snippet 컬럼 추가**

Edit `packages/db/schema/wiki-page-index.ts` — `freshnessSlaDays` 다음 라인에 추가:
```ts
    freshnessSlaDays: integer("freshness_sla_days"),
    /** 120-200자 페이지 요약. wiki-reproject가 frontmatter.summary 또는 body 첫 문단에서 추출. */
    snippet: varchar("snippet", { length: 200 }),
```

- [ ] **Step 3: Drizzle migration 생성**

Run:
```bash
cd C:/Users/kms/Desktop/dev/jarvis && pnpm db:generate
```
Expected: `packages/db/drizzle/` 아래 신규 `NNNN_*.sql` 파일 생성. 내용에 `ALTER TABLE "wiki_page_index" ADD COLUMN "snippet" varchar(200);` 포함.

- [ ] **Step 4: Migration 적용**

Run:
```bash
pnpm db:migrate
```
Expected: `wiki_page_index` 테이블에 `snippet` 컬럼 추가됨.

검증:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "\d wiki_page_index" | grep snippet
```
Expected: `snippet | character varying(200)` 라인 출력.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/kms/Desktop/dev/jarvis
git add packages/db/schema/wiki-page-index.ts packages/db/drizzle/
git commit -m "feat(db): add wiki_page_index.snippet for catalog compact

120-char snippet populated by wiki-reproject from body first paragraph.
Used by Phase-γ LLM shortlist to keep catalog input under 15K tokens
without disk read per row."
```

---

## Task 2: build-wiki-index 실제 실행

**Files:**
- No code changes. Run existing `scripts/build-wiki-index.ts`.
- Creates: `wiki/jarvis/**/index.md` (11개 도메인 카탈로그)

- [ ] **Step 1: Dry-run 최종 확인**

Run:
```bash
cd C:/Users/kms/Desktop/dev/jarvis && pnpm exec tsx scripts/build-wiki-index.ts --dry-run 2>&1 | tail -15
```
Expected: `domainsScanned=11 indicesWritten=0 pagesListed=1322 skipped=2`

- [ ] **Step 2: 실제 실행**

Run:
```bash
pnpm exec tsx scripts/build-wiki-index.ts
```
Expected: 로그 끝에 `indicesWritten=11`. 다음 파일 생성됨:
- `wiki/jarvis/auto/syntheses/index.md`
- `wiki/jarvis/auto/companies/index.md`
- `wiki/jarvis/auto/infra/index.md`
- `wiki/jarvis/auto/onboarding/index.md`
- `wiki/jarvis/auto/reports/index.md`
- `wiki/jarvis/manual/guidebook/index.md`
- `wiki/jarvis/manual/policies/index.md`
- `wiki/jarvis/manual/procedures/index.md`
- `wiki/jarvis/manual/references/index.md`

- [ ] **Step 3: 확인**

Run:
```bash
head -20 wiki/jarvis/manual/policies/index.md
```
Expected: `title: "Policies Index"`, `page_count: 30`, 페이지 리스트.

- [ ] **Step 4: Commit (wiki git 별도 초기화)**

wiki/jarvis/는 Jarvis 메인 repo에서 분리 관리 예정. 이 단계에서는 아직 Jarvis 메인 repo에 포함. 추후 Task 21에서 분리.

Run (지금은 메인 repo에 staging만):
```bash
# index.md는 auto-generated이므로 커밋 보류. Task 21에서 wiki/jarvis/ 별도 git init 후 처리.
echo "wiki/jarvis/ git 분리는 Task 21에서 처리"
```

---

## Task 3: wiki-reproject 실제 실행 (1322 → DB)

**Files:**
- No code changes. Run existing `scripts/wiki-reproject.ts`.

- [ ] **Step 1: Dry-run with 올바른 workspace**

Run:
```bash
cd C:/Users/kms/Desktop/dev/jarvis && pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis --dry-run --limit=50
```
Expected: `workspace=jarvis (<real-uuid>)` — Task 1 Step 1에서 INSERT한 uuid 앞 8자리.

- [ ] **Step 2: 실제 실행**

Run:
```bash
pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis
```
Expected: `collected=1333 processed=1333 skipped=~0 links=<N>` (index.md 11개 포함 → 1322+11=1333). 실행 시간 1-5분.

- [ ] **Step 3: DB 검증**

Run:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT count(*), type FROM wiki_page_index GROUP BY type ORDER BY count(*) DESC;"
```
Expected: 
```
 count | type
-------+-----------
  ~690 | synthesis
  ~200 | reference
  ...
```

```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT count(*) FROM wiki_page_link;"
```
Expected: `count >= 500` (cases synthesis들이 `linkedPages`, `sources` 많이 포함).

- [ ] **Step 4: Ask AI 동작 확인** (수동)

브라우저 http://localhost:3010/ask 접속 → "사내 동호회 몇개 있어?" 입력.
Expected: "페이지 찾지 못했어요" 대신 **실제 답변** — `manual/references/clubs-activities.md` 내용 기반.

- [ ] **Step 5: Commit**

```bash
git add -A  # DB projection은 파일이 아니라 커밋할 코드 없음. 참고 문서화만.
# 실제로는 Task 1, 2, 3 종료 후 한꺼번에 commit. 여기서는 skip.
echo "Task 3 완료 — wiki_page_index populated"
```

---

## Task 4: CLIProxy gateway 기동 + FEATURE_SUBSCRIPTION_QUERY 활성

**Files:**
- Modify: `.env` (local, not committed) — `FEATURE_SUBSCRIPTION_QUERY=true` 추가

- [ ] **Step 1: OAuth auths 확인**

Run:
```bash
ls infra/cliproxy/auths/
```
Expected: `codex-qoxmfaktmxj@gmail.com-pro.json` (4.3KB) — 이미 완료됨.

- [ ] **Step 2: Gateway 컨테이너 기동**

Run:
```bash
cd C:/Users/kms/Desktop/dev/jarvis && docker compose -f docker/docker-compose.yml up -d cli-proxy
```
Expected: `Container jarvis-cli-proxy  Started`

- [ ] **Step 3: Healthcheck 통과 확인**

Run:
```bash
sleep 20 && docker ps --filter name=cli-proxy --format "{{.Status}}"
```
Expected: `Up N seconds (healthy)` — "unhealthy"면 `docker logs jarvis-cli-proxy` 확인.

- [ ] **Step 4: /v1/models smoke test**

Run:
```bash
curl -sS -H "Authorization: Bearer sk-jarvis-local-dev" http://127.0.0.1:8317/v1/models | head -c 500
```
Expected: JSON 응답에 `"id":"gpt-5-codex"` 또는 `"gpt-5.4-mini"` 포함.

- [ ] **Step 5: .env flag 추가**

Edit `.env` (not committed):
```bash
FEATURE_SUBSCRIPTION_QUERY=true
FEATURE_SUBSCRIPTION_LINT=true
# FEATURE_SUBSCRIPTION_INGEST=false  # ToS — 직결 유지
```

- [ ] **Step 6: web 재기동**

Terminal (기존 dev 서버 실행 중인 곳)에서 Ctrl+C → 재실행:
```bash
pnpm dev
```
Expected: `@jarvis/web:dev: - Local: http://localhost:3010`

- [ ] **Step 7: Ask AI로 실제 구독 경로 확인**

브라우저에서 "사내 동호회 몇개 있어?" → 응답 후:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT via, model, op FROM llm_call_log ORDER BY created_at DESC LIMIT 3;"
```
Expected: `via = 'gateway'` (구독 경로로 호출됐다는 증거).

- [ ] **Step 8: Commit (.env는 gitignored — 별도 커밋 없음)**

```bash
echo "Task 4 완료 — CLIProxy subscription path active"
```

---

## Task 5: A-20 eval fixture 추가 (eval-031~050)

**Files:**
- Create: `apps/worker/eval/fixtures/2026-04/eval-031.md` ~ `eval-050.md` (20개)

- [ ] **Step 1: 기존 fixture 형식 확인**

Run:
```bash
head -30 apps/worker/eval/fixtures/2026-04/eval-001.md
```
Expected: frontmatter (question, expected_pages, category) + body. 포맷 기억.

- [ ] **Step 2: eval-031.md 작성 (사용자 A-20 첫 번째)**

Create `apps/worker/eval/fixtures/2026-04/eval-031.md`:
```markdown
---
id: eval-031
category: policy
question: "빙부상 휴가 며칠이야?"
expected_pages:
  - "manual/policies/leave-vacation"
difficulty: medium
notes: "용어 매핑 필요 — 빙부상 = 처부모상"
---

이 질문에 올바르게 답하려면 `manual/policies/leave-vacation.md`의 경조사 휴가 규정
섹션을 읽고 "배우자 부모 사망" 조항을 "빙부상"과 매칭해야 한다.
```

- [ ] **Step 3: eval-032 ~ eval-050 19개 작성**

20개 질문 목록 (사용자 제공 13개 + 3개 추가 + 플랜이 제안한 4개):

| id | category | question |
|---|---|---|
| 031 | policy | "빙부상 휴가 며칠이야?" |
| 032 | code | "사내 인사시스템 Intellij 어떻게 설정해?" |
| 033 | code | "ehr5는 어떤 구조로 되어 있어?" |
| 034 | process | "근태 프로세스 알려줘" |
| 035 | process | "급여 프로세스 알려줘" |
| 036 | complex | "전표에 급여 항목 추가해서 I/F전송하려면 어디부터 봐야 해?" |
| 037 | process | "복리후생에서 신청서 만들면 어떤걸 확인해야 해?" |
| 038 | code | "P_HRI_AFTER_PROC_EXEC 프로시저에 어떤거 들어 있어?" |
| 039 | policy | "휴가신청되면 내 남은 휴가는 어떻게 관리돼?" |
| 040 | complex | "급여 진행 시 근태 마감되야 해?" |
| 041 | incident | "세금계산이 틀렸는데 어디 봐야 해?" |
| 042 | complex | "특정금액이 비과세로 나가야 하는데 어떻게 설정해야 해?" |
| 043 | complex | "비과세 추가 시 연말정산에도 반영되야 하면 수정해야 하는 프로시저들이 있어?" |
| 044 | incident | "대결자를 통해 결재 신청 시 에러 발생, 어디가 문제일까?" |
| 045 | code | "이미 계산 완료된 급여 일자에 급여 코드를 수정할 때 어느 테이블 수정 필요?" |
| 046 | code | "통상임금 항목그룹코드 변경 시 프로시저/함수에서 수정이 필요한 곳?" |
| 047 | reference | "사내 동호회 몇개 있어?" |
| 048 | reference | "퇴직연금 DB/DC 차이가 뭐야?" |
| 049 | onboarding | "신규 입사자 오리엔테이션 일정 알려줘" |
| 050 | complex | "육아휴직 중인 직원 급여 계산 프로세스는?" |

각 파일을 위 Step 2 템플릿으로 작성. `expected_pages`는 `wiki/jarvis/`에서 grep으로 후보 페이지 확인 후 기입.

- [ ] **Step 4: fixture 로더 테스트**

Run:
```bash
pnpm exec tsx apps/worker/eval/loader.ts --count | grep "2026-04"
```
Expected: `2026-04: 50 fixtures` (기존 30 + 신규 20).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/eval/fixtures/2026-04/eval-03*.md apps/worker/eval/fixtures/2026-04/eval-04*.md apps/worker/eval/fixtures/2026-04/eval-050.md
git commit -m "test(eval): add A-20 fixtures for pilot acceptance

eval-031~050: 20 real failure questions from existing 사내 AI 챗봇.
Categories: policy, code, process, complex, incident, reference, onboarding.
Acceptance gate: Recall@5 ≥ 80%, answer quality ≥ 0.7."
```

---

## Task 6: Baseline 측정 (legacy SQL shortlist)

**Files:**
- No code changes. Run existing eval runner.

- [ ] **Step 1: FEATURE_LLM_SHORTLIST 확인 (default false)**

Run:
```bash
grep FEATURE_LLM_SHORTLIST .env .env.example
```
Expected: 없음 (아직 추가 전) → 기본 false, legacy shortlist 사용.

- [ ] **Step 2: Baseline eval 실행**

Run:
```bash
pnpm eval:run 2>&1 | tee /tmp/baseline-2026-04-20.log
```
Expected: 각 fixture마다 Recall@5, Quality, Grounding 3 메트릭. 종합 요약 출력.

- [ ] **Step 3: Baseline 수치 기록**

Create `docs/superpowers/plans/baseline-2026-04-20.md`:
```markdown
# A-20 Baseline — legacy SQL shortlist (2026-04-20)

**Conditions:**
- FEATURE_PAGE_FIRST_QUERY=true
- FEATURE_LLM_SHORTLIST=false (default)
- FEATURE_SUBSCRIPTION_QUERY=true (synthesize via gateway)
- Wiki: 1322 pages indexed (Task 3 완료)
- Graphify: 미적용 (code/** 없음)

## 결과

| Metric | Value |
|---|---|
| Recall@5 (overall) | ??% |
| Quality (mean) | ??? |
| Grounding | ???% |

## Category별

| Category | Recall@5 | Quality |
|---|---|---|
| policy | ??% | ??? |
| code | ??% | ??? | (예상: 매우 낮음 — Graphify 없음)
| process | ??% | ??? |
| complex | ??% | ??? |
| incident | ??% | ??? |
| reference | ??% | ??? |
| onboarding | ??% | ??? |

## R/S/D 라벨링 (실패 fixture만)

| fixture | label | reason |
|---|---|---|
| eval-0XX | R | shortlist miss (aliases 없음) |
| eval-0XX | S | synthesize 부정확 |
| eval-0XX | D | 원본 데이터 자체 없음 |
```

- [ ] **Step 4: Commit baseline 기록**

```bash
git add docs/superpowers/plans/baseline-2026-04-20.md
git commit -m "test(eval): record A-20 baseline with legacy SQL shortlist

Baseline Recall@5/Quality/Grounding per category before C implementation.
R/S/D labels identify retrieval vs synthesis vs data-gap failures."
```

---

## Task 7: `catalog.ts` 신규 (shortlist.ts rename + 기능 축소)

**Files:**
- Create: `packages/ai/page-first/catalog.ts`
- Modify: `packages/ai/page-first/shortlist.ts` (lexicalShortlist → legacyLexicalShortlist export)
- Create: `packages/ai/page-first/__tests__/catalog.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/ai/page-first/__tests__/catalog.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCatalog } from "../catalog.js";

vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
  },
}));

describe("getCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns RBAC-filtered pages with snippet + aliases + tags", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          path: "manual/policies/leave-vacation",
          title: "휴가 규정",
          slug: "leave-vacation",
          aliases: ["휴가", "빙부상", "처부모상"],
          tags: ["domain/hr", "topic/leave"],
          snippet: "근속 연수별 연차 부여와 경조사 휴가 규정을 정의한다.",
          updated_at: new Date("2026-04-01"),
        },
      ],
    } as never);

    const hits = await getCatalog({
      workspaceId: "ws-uuid",
      userPermissions: ["knowledge:read"],
      domain: "policies",
      limit: 500,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]!.path).toBe("manual/policies/leave-vacation");
    expect(hits[0]!.aliases).toContain("빙부상");
    expect(hits[0]!.snippet).toContain("경조사");
  });

  it("applies sensitivity filter via buildWikiSensitivitySqlFilter", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);

    await getCatalog({
      workspaceId: "ws-uuid",
      userPermissions: [],  // no permissions → only PUBLIC
      limit: 500,
    });

    const sqlCall = vi.mocked(db.execute).mock.calls[0]![0];
    // @ts-expect-error — internal sql object
    expect(sqlCall.queryChunks.map((c) => c.value ?? "").join("")).toContain(
      "sensitivity",
    );
  });

  it("omits domain filter when domain is undefined", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);

    await getCatalog({
      workspaceId: "ws-uuid",
      userPermissions: ["knowledge:read"],
      limit: 500,
    });

    const sqlCall = vi.mocked(db.execute).mock.calls[0]![0];
    // @ts-expect-error
    const raw = sqlCall.queryChunks.map((c) => c.value ?? "").join("");
    expect(raw).not.toContain("frontmatter->>'domain'");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
cd C:/Users/kms/Desktop/dev/jarvis && pnpm --filter=@jarvis/ai test -- page-first/__tests__/catalog.test.ts
```
Expected: FAIL — `catalog` module not found.

- [ ] **Step 3: Create `catalog.ts`**

Create `packages/ai/page-first/catalog.ts`:
```ts
/**
 * packages/ai/page-first/catalog.ts
 *
 * Phase-γ T7 — RBAC catalog pull (C 설계 Step 2).
 *
 * Role: DB는 권한 게이트키퍼로만 동작. "어떤 페이지를 읽을지" 결정은
 * llm-shortlist.ts가 담당. 본 함수는 single SELECT로 workspace/sensitivity/
 * requiredPermission/domain 필터를 적용한 메타 레코드 목록을 반환한다.
 *
 * 출력 컬럼: path, title, slug, aliases (jsonb array), tags (jsonb array),
 * snippet (varchar 200 from Task 1), updatedAt.
 */
import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { buildWikiSensitivitySqlFilter } from "@jarvis/auth/rbac";

export interface CatalogRow {
  path: string;
  title: string;
  slug: string;
  aliases: string[];
  tags: string[];
  snippet: string | null;
  updatedAt: Date;
}

export interface CatalogOptions {
  workspaceId: string;
  userPermissions: string[];
  /** Filter by frontmatter->>'domain' when provided. */
  domain?: string;
  /** Default 500, cap at 1500 to keep memory bounded. */
  limit?: number;
}

export async function getCatalog(opts: CatalogOptions): Promise<CatalogRow[]> {
  const limit = Math.min(opts.limit ?? 500, 1500);
  const sensitivityFilter = buildWikiSensitivitySqlFilter(opts.userPermissions);

  const result = await db.execute<{
    path: string;
    title: string;
    slug: string;
    aliases: unknown;
    tags: unknown;
    snippet: string | null;
    updated_at: Date;
  }>(sql`
    SELECT
      path,
      title,
      slug,
      COALESCE(frontmatter -> 'aliases', '[]'::jsonb) AS aliases,
      COALESCE(frontmatter -> 'tags', '[]'::jsonb) AS tags,
      snippet,
      updated_at
    FROM wiki_page_index
    WHERE workspace_id = ${opts.workspaceId}
      AND ${sensitivityFilter}
      AND (
        required_permission IS NULL
        OR required_permission = ANY(${opts.userPermissions})
      )
      ${opts.domain ? sql`AND frontmatter->>'domain' = ${opts.domain}` : sql``}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    path: r.path,
    title: r.title,
    slug: r.slug,
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    snippet: r.snippet,
    updatedAt: r.updated_at,
  }));
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/catalog.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Rename `shortlist.ts` lexicalShortlist → legacyLexicalShortlist**

Edit `packages/ai/page-first/shortlist.ts`:
- 기존 `export async function lexicalShortlist(...)` → `export async function legacyLexicalShortlist(...)`
- 파일 상단 JSDoc에 추가:
```ts
/**
 * **LEGACY FALLBACK** — `catalog.ts` + `llm-shortlist.ts`가 기본 경로.
 * FEATURE_LLM_SHORTLIST=false 또는 LLM shortlist 실패 시 이 함수가 graceful
 * fallback으로 호출됨. C 설계 Section 6 에러 핸들링 #4 참조.
 */
```

- [ ] **Step 6: Run existing shortlist.test.ts (regression)**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/page-first-shortlist.test.ts
```
Expected: 기존 테스트 모두 PASS (함수 이름 import만 `legacyLexicalShortlist`로 수정 필요할 수 있음).

수정이 필요한 경우: `page-first-shortlist.test.ts`에서 `import { lexicalShortlist }` → `import { legacyLexicalShortlist as lexicalShortlist }` (테스트 코드 최소 수정).

- [ ] **Step 7: Commit**

```bash
git add packages/ai/page-first/catalog.ts packages/ai/page-first/shortlist.ts packages/ai/page-first/__tests__/catalog.test.ts packages/ai/page-first/__tests__/page-first-shortlist.test.ts
git commit -m "feat(ai): add catalog.ts RBAC gate + rename legacy shortlist

catalog.ts: single SELECT with workspace/sensitivity/requiredPermission/
domain filter. Returns metadata rows only (no ranking, no LLM).
shortlist.ts: lexicalShortlist → legacyLexicalShortlist, kept as
FEATURE_LLM_SHORTLIST=false fallback. Tests updated."
```

---

## Task 8: `domain-infer.ts` 신규 (keyword 기반 domain 추정)

**Files:**
- Create: `packages/ai/page-first/domain-infer.ts`
- Create: `packages/ai/page-first/__tests__/domain-infer.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/ai/page-first/__tests__/domain-infer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { inferDomain } from "../domain-infer.js";

describe("inferDomain", () => {
  it("returns 'policies' for 휴가 keyword", () => {
    expect(inferDomain("빙부상 휴가 며칠이야?")).toBe("policies");
  });

  it("returns 'code' for 프로시저 keyword", () => {
    expect(inferDomain("P_HRI_AFTER_PROC_EXEC 프로시저에 뭐 있어?")).toBe(
      "code",
    );
  });

  it("returns 'procedures' for 신청 keyword", () => {
    expect(inferDomain("회의실 예약 어떻게 신청해?")).toBe("procedures");
  });

  it("returns null for ambiguous question (multiple domain hits)", () => {
    expect(
      inferDomain("휴가 신청 프로시저 어떻게 만들어?"),
    ).toBeNull();
  });

  it("returns null when no keyword matches", () => {
    expect(inferDomain("안녕")).toBeNull();
  });

  it("is case-insensitive for identifier patterns", () => {
    expect(inferDomain("p_sal_calc 보고 싶어")).toBe("code");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/domain-infer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `domain-infer.ts`**

```ts
/**
 * packages/ai/page-first/domain-infer.ts
 *
 * Phase-γ T8 — cheap domain inference (C 설계 Step 1).
 *
 * Keyword hit count로 domain 추정. tie 또는 hit 0 → null → catalog 전체
 * 조회. 정확도보다 "확실할 때만 축소"가 목적. 5000 페이지 규모까지 LLM
 * 토큰 15K cap을 유지하기 위한 사전 축소 장치.
 */
export type Domain =
  | "policies"
  | "procedures"
  | "references"
  | "cases"
  | "code"
  | "onboarding"
  | "guidebook"
  | "infra";

const KEYWORDS: Record<Domain, string[]> = {
  policies: [
    "휴가",
    "빙부상",
    "경조사",
    "비과세",
    "연말정산",
    "수당",
    "성과급",
    "복리",
    "퇴직연금",
    "급여정책",
    "연차",
    "출장비",
  ],
  procedures: [
    "신청",
    "예약",
    "등록",
    "접수",
    "재발급",
    "오리엔테이션",
    "입사",
    "퇴사절차",
  ],
  references: [
    "조직도",
    "계정과목",
    "faq",
    "직무기술서",
    "직급체계",
    "연중행사",
    "동호회",
  ],
  cases: ["문의", "장애", "문제점", "유사사례", "사례"],
  code: [
    "프로시저",
    "테이블",
    "i/f",
    "인터페이스",
    "ehr4",
    "ehr5",
    "컬럼",
    "함수",
    "쿼리",
  ],
  onboarding: ["신규입사", "웰컴", "멘토링", "수습"],
  guidebook: ["가이드북"],
  infra: ["인프라", "서버구성", "회사별구성"],
};

/** Patterns that strongly signal "code" regardless of other tokens. */
const CODE_IDENTIFIER_PATTERNS = [
  /\bp_[a-z0-9_]+/i, // Oracle procedure names like P_HRI_AFTER_PROC_EXEC
  /\bf_[a-z0-9_]+/i,
  /\btb_[a-z0-9_]+/i,
  /\bv_[a-z0-9_]+/i,
];

export function inferDomain(question: string): Domain | null {
  const q = question.toLowerCase();

  // Strong signal: identifier pattern → code (overrides tie logic).
  if (CODE_IDENTIFIER_PATTERNS.some((rx) => rx.test(q))) {
    return "code";
  }

  const scores: Record<string, number> = {};
  for (const [domain, kws] of Object.entries(KEYWORDS)) {
    scores[domain] = kws.filter((kw) => q.includes(kw.toLowerCase())).length;
  }

  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;

  const winners = Object.entries(scores).filter(([_, s]) => s === max);
  if (winners.length > 1) return null; // ambiguous tie

  return winners[0]![0] as Domain;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/domain-infer.test.ts
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/page-first/domain-infer.ts packages/ai/page-first/__tests__/domain-infer.test.ts
git commit -m "feat(ai): add domain-infer for catalog pre-filter

Cheap keyword-based domain detection. Identifier pattern (P_/F_/TB_/V_)
forces 'code' domain. Ties or zero hits return null → catalog pulls
all pages (cost fallback to full LLM shortlist)."
```

---

## Task 9: `llm-shortlist.ts` 신규 (LLM 탐색자)

**Files:**
- Create: `packages/ai/page-first/llm-shortlist.ts`
- Create: `packages/ai/page-first/__tests__/llm-shortlist.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/ai/page-first/__tests__/llm-shortlist.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectPages } from "../llm-shortlist.js";
import type { CatalogRow } from "../catalog.js";

const mockCatalog: CatalogRow[] = [
  {
    path: "manual/policies/leave-vacation",
    title: "휴가 규정",
    slug: "leave-vacation",
    aliases: ["휴가", "빙부상", "처부모상", "경조사"],
    tags: ["domain/hr"],
    snippet: "근속 연수별 연차 부여와 경조사 휴가 규정",
    updatedAt: new Date("2026-04-01"),
  },
  {
    path: "manual/procedures/leave-application-forms",
    title: "휴가 신청서",
    slug: "leave-application-forms",
    aliases: ["휴가신청"],
    tags: ["domain/procedure"],
    snippet: "휴가 신청서 작성 방법",
    updatedAt: new Date("2026-04-01"),
  },
];

vi.mock("../../provider.js", () => ({
  getProvider: vi.fn(() => ({
    client: {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    },
    via: "gateway",
  })),
  resolveModel: vi.fn(() => "gpt-5.4-mini"),
}));

describe("selectPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validated page slugs when LLM responds with valid JSON", async () => {
    const { getProvider } = await import("../../provider.js");
    const create = vi.mocked(
      vi.mocked(getProvider).mock.results[0]?.value.client.chat.completions
        .create ?? (() => {}),
    );
    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pages: ["leave-vacation"],
              reasoning: "빙부상은 경조사 휴가 규정에서 다룸",
            }),
          },
        },
      ],
    } as never);

    const result = await selectPages({
      question: "빙부상 휴가 며칠이야?",
      catalog: mockCatalog,
    });

    expect(result.pages).toContain("leave-vacation");
    expect(result.reasoning).toContain("경조사");
    expect(result.fallback).toBe(false);
  });

  it("filters hallucinated slugs not in catalog", async () => {
    const { getProvider } = await import("../../provider.js");
    const create = vi.mocked(
      vi.mocked(getProvider).mock.results[0]?.value.client.chat.completions
        .create ?? (() => {}),
    );
    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pages: ["leave-vacation", "nonexistent-page", "another-fake"],
              reasoning: "...",
            }),
          },
        },
      ],
    } as never);

    const result = await selectPages({
      question: "빙부상 휴가 며칠이야?",
      catalog: mockCatalog,
    });

    expect(result.pages).toEqual(["leave-vacation"]);
    expect(result.hallucinationCount).toBe(2);
  });

  it("sets fallback=true when filtered pages < 2", async () => {
    const { getProvider } = await import("../../provider.js");
    const create = vi.mocked(
      vi.mocked(getProvider).mock.results[0]?.value.client.chat.completions
        .create ?? (() => {}),
    );
    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pages: ["fake1", "fake2"],
              reasoning: "모두 가짜",
            }),
          },
        },
      ],
    } as never);

    const result = await selectPages({
      question: "...",
      catalog: mockCatalog,
    });

    expect(result.fallback).toBe(true);
  });

  it("sets fallback=true when JSON parse fails", async () => {
    const { getProvider } = await import("../../provider.js");
    const create = vi.mocked(
      vi.mocked(getProvider).mock.results[0]?.value.client.chat.completions
        .create ?? (() => {}),
    );
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "not json at all" } }],
    } as never);

    const result = await selectPages({
      question: "...",
      catalog: mockCatalog,
    });

    expect(result.fallback).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/llm-shortlist.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `llm-shortlist.ts`**

```ts
/**
 * packages/ai/page-first/llm-shortlist.ts
 *
 * Phase-γ T9 — LLM-driven page selection (C 설계 Step 3-4).
 *
 * Catalog + 질문을 LLM에 주고 "이 5-8 페이지 읽겠다" 응답을 받는다.
 * zod로 schema 검증 + hallucination slug 필터. 검증 실패 시 fallback=true
 * 플래그로 index.ts에서 legacyLexicalShortlist 경유.
 */
import { z } from "zod";
import { getProvider, resolveModel } from "../provider.js";
import type { CatalogRow } from "./catalog.js";

export const PAGE_FIRST_SHORTLIST_PROMPT_VERSION = "v1" as const;

export interface SelectPagesOpts {
  question: string;
  catalog: CatalogRow[];
  /** Optional Graphify module summary for code-intent questions. */
  graphifySummary?: string;
  /** Max pages to select. Default 8. */
  maxPages?: number;
}

export interface SelectPagesResult {
  pages: string[];
  reasoning: string;
  fallback: boolean;
  hallucinationCount: number;
  via: "gateway" | "direct" | "fallback";
}

const ResponseSchema = z.object({
  pages: z.array(z.string()).min(1).max(15),
  reasoning: z.string().max(1000),
});

function compactCatalog(catalog: CatalogRow[]): string {
  return catalog
    .map((row) => {
      const aliases = row.aliases.length > 0
        ? ` [${row.aliases.slice(0, 5).join(", ")}]`
        : "";
      const snippet = row.snippet
        ? ` — ${row.snippet.slice(0, 120)}`
        : "";
      return `\`${row.slug}\`${aliases}${snippet}`;
    })
    .join("\n");
}

function buildPrompt(opts: SelectPagesOpts): string {
  const max = opts.maxPages ?? 8;
  const graphify = opts.graphifySummary
    ? `\n\n== Graphify code-graph module summaries ==\n${opts.graphifySummary}\n`
    : "";
  return `You are the Jarvis wiki navigator. Select 2-${max} pages from the catalog that are most likely to answer the user's question. Consider:

- Aliases in brackets (synonyms; e.g. "빙부상" = "처부모상")
- Snippets (120-char summary)
- Wikilink hubs: pages frequently linked TO by others carry weight

Question: ${opts.question}

Catalog (${opts.catalog.length} pages):
${compactCatalog(opts.catalog)}
${graphify}

Return ONLY JSON, no prose:
{
  "pages": ["slug1", "slug2", ...],
  "reasoning": "1-2 sentences on why you chose these pages"
}`;
}

export async function selectPages(
  opts: SelectPagesOpts,
): Promise<SelectPagesResult> {
  const { client, via } = getProvider("query");
  const model = resolveModel("query");
  const slugsInCatalog = new Set(opts.catalog.map((r) => r.slug));

  let raw: string | null;
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: buildPrompt(opts) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 800,
    });
    raw = res.choices[0]?.message?.content ?? null;
  } catch (_err) {
    return {
      pages: [],
      reasoning: "LLM call failed",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  if (!raw) {
    return {
      pages: [],
      reasoning: "Empty LLM response",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(JSON.parse(raw));
  } catch (_err) {
    return {
      pages: [],
      reasoning: "JSON parse or schema validation failed",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  const validPages = parsed.pages.filter((slug) => slugsInCatalog.has(slug));
  const hallucinationCount = parsed.pages.length - validPages.length;

  return {
    pages: validPages,
    reasoning: parsed.reasoning,
    fallback: validPages.length < 2,
    hallucinationCount,
    via,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/llm-shortlist.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/page-first/llm-shortlist.ts packages/ai/page-first/__tests__/llm-shortlist.test.ts
git commit -m "feat(ai): add LLM shortlist selector (탐색자 LLM)

Feeds catalog + question to gpt-5.4-mini via provider.ts (gateway or
direct). Zod-validates response, filters hallucinated slugs not in
catalog, sets fallback=true if <2 valid pages. Callers use fallback
flag to re-route to legacyLexicalShortlist."
```

---

## Task 10: `page-first/index.ts` 재배선 + FEATURE_LLM_SHORTLIST 분기

**Files:**
- Modify: `packages/ai/page-first/index.ts`
- Modify: `.env.example` (FEATURE_LLM_SHORTLIST=false 추가)

- [ ] **Step 1: .env.example에 flag 추가**

Edit `.env.example` (line ~50, FEATURE_SUBSCRIPTION_* 옆):
```bash
# Phase-γ LLM-first retrieval. false면 legacySQL shortlist 사용.
FEATURE_LLM_SHORTLIST=false
```

- [ ] **Step 2: index.ts 재배선**

Edit `packages/ai/page-first/index.ts`:

기존 import:
```ts
import { lexicalShortlist } from "./shortlist.js";
```
→ 변경:
```ts
import { legacyLexicalShortlist } from "./shortlist.js";
import { getCatalog } from "./catalog.js";
import { inferDomain } from "./domain-infer.js";
import { selectPages } from "./llm-shortlist.js";
```

기존 pipeline (shortlist → expand → read → synth) 중 **shortlist 부분만** 분기:

기존 (대략 line 100-130):
```ts
const shortlist = await lexicalShortlist({
  workspaceId,
  userPermissions,
  question,
  topK: 20,
});
```

→ 변경:
```ts
const useLlmShortlist = process.env["FEATURE_LLM_SHORTLIST"] === "true";
let shortlist: { slug: string; path: string }[];
let shortlistVia: "llm" | "legacy" = "legacy";

if (useLlmShortlist) {
  const domain = inferDomain(question);
  const catalog = await getCatalog({
    workspaceId,
    userPermissions,
    domain: domain ?? undefined,
    limit: 500,
  });

  if (catalog.length === 0) {
    yield { type: "content", chunk: "해당 질문에 답할 수 있는 위키 페이지를 찾지 못했어요." };
    yield { type: "done", totalTokens: 0 };
    return;
  }

  const result = await selectPages({ question, catalog });

  if (result.fallback) {
    // Graceful degradation to legacy
    const legacy = await legacyLexicalShortlist({
      workspaceId,
      userPermissions,
      question,
      topK: 8,
    });
    shortlist = legacy.map((h) => ({ slug: h.slug, path: h.path }));
    shortlistVia = "legacy";
  } else {
    // Map selected slugs back to full page paths from catalog
    shortlist = result.pages.map((slug) => {
      const row = catalog.find((r) => r.slug === slug)!;
      return { slug: row.slug, path: row.path };
    });
    shortlistVia = "llm";
  }
} else {
  // FEATURE_LLM_SHORTLIST=false — legacy path
  const legacy = await legacyLexicalShortlist({
    workspaceId,
    userPermissions,
    question,
    topK: 20,
  });
  shortlist = legacy.map((h) => ({ slug: h.slug, path: h.path }));
  shortlistVia = "legacy";
}

// Emit route event with shortlist origin for observability
yield {
  type: "route",
  lane: "wiki.page-first",
  confidence: 1,
  shortlistVia,  // 'llm' | 'legacy' — dashboards can split
};
```

나머지 expand → read → synth는 기존 그대로. `expand`는 optional — C 설계에서 "선택 제거" 고려. 이번 plan에서는 **유지**하되 `shortlistVia === "llm"`인 경우 skip (LLM이 이미 wikilink hub 고려했을 것이라 가정):

```ts
const expanded = shortlistVia === "llm"
  ? shortlist
  : await expandOneHop({ workspaceId, shortlist });
```

- [ ] **Step 3: Run existing page-first index test**

Run:
```bash
pnpm --filter=@jarvis/ai test -- page-first/__tests__/page-first.test.ts
```
Expected: PASS. 테스트가 lexicalShortlist를 직접 import하는 경우 `legacyLexicalShortlist`로 수정 필요할 수 있음.

- [ ] **Step 4: 통합 smoke — legacy path (flag false)**

Run:
```bash
FEATURE_LLM_SHORTLIST=false pnpm eval:run 2>&1 | tail -20
```
Expected: 기존 legacy 경로로 돌아감. Task 6의 baseline과 수치 유사해야 함.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/page-first/index.ts .env.example
git commit -m "feat(ai): wire llm-shortlist into page-first pipeline

Feature-flag gated (FEATURE_LLM_SHORTLIST). When true: domain-infer →
catalog → selectPages → (fallback to legacy if <2 valid slugs).
When false: original legacyLexicalShortlist. Route event carries
shortlistVia for observability dashboards."
```

---

## Task 11: E2E 통합 테스트

**Files:**
- Create: `packages/ai/__tests__/page-first-llm-integration.test.ts`

- [ ] **Step 1: 통합 test 작성**

Create `packages/ai/__tests__/page-first-llm-integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { pageFirstAsk } from "../page-first/index.js";

describe("pageFirstAsk with FEATURE_LLM_SHORTLIST=true", () => {
  beforeAll(() => {
    process.env["FEATURE_LLM_SHORTLIST"] = "true";
  });

  afterAll(() => {
    delete process.env["FEATURE_LLM_SHORTLIST"];
  });

  it("emits route event with shortlistVia=llm when LLM shortlist succeeds", async () => {
    // Mock catalog and selectPages via vi.mock
    // Assert SSE event sequence: route → sources → content → done
    // Expect route.shortlistVia === 'llm'
    // (실제 구현 시 mock setup 포함)
  });

  it("falls back to legacy when LLM returns hallucinations", async () => {
    // Mock selectPages to return { pages: [], fallback: true }
    // Assert shortlistVia === 'legacy'
  });
});
```

- [ ] **Step 2: Run test**

Run:
```bash
pnpm --filter=@jarvis/ai test -- __tests__/page-first-llm-integration.test.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/__tests__/page-first-llm-integration.test.ts
git commit -m "test(ai): add E2E test for LLM shortlist + legacy fallback"
```

---

## Task 12: C 구현 A-20 재측정

**Files:**
- No code. Run eval.

- [ ] **Step 1: Flag 활성**

Edit `.env`:
```bash
FEATURE_LLM_SHORTLIST=true
```
Restart dev server.

- [ ] **Step 2: Eval 실행**

Run:
```bash
pnpm eval:run 2>&1 | tee /tmp/after-c-2026-04-20.log
```
Expected: 20개 fixture 모두 통과. 수치 파일로 저장.

- [ ] **Step 3: Delta 계산**

```bash
diff -u /tmp/baseline-2026-04-20.log /tmp/after-c-2026-04-20.log | tail -50
```

수동으로 Recall@5, Quality 계산 후 `docs/superpowers/plans/after-c-2026-04-20.md` 작성:
```markdown
# A-20 After C — LLM shortlist (2026-04-20)

| Metric | Baseline | After C | Delta |
|---|---|---|---|
| Recall@5 | ??% | ??% | +??% |
| Quality | ??? | ??? | +??? |
| Grounding | ???% | ???% | +??? |

## Category별

| Category | Baseline Recall@5 | After C Recall@5 | 판정 |
|---|---|---|---|
| policy (eval-031, 039) | ??% | ??% | pass/fail |
| code (032, 033, 038, 045, 046) | 0% 예상 | 여전히 낮음 (Graphify 없이는) | Phase-δ로 |
| ...

## 승인 게이트
- [ ] Recall@5 절대값 +10% 이상
- [ ] Quality 유지 이상
- [ ] Grounding 100% 유지
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/after-c-2026-04-20.md
git commit -m "test(eval): A-20 after-C measurement

Recall@5 delta vs baseline. Per-category pass/fail. Code-category
still low (Graphify pending in Phase-δ)."
```

---

## Task 13: UI `/wiki/graph` nav 노출 + 빈 상태 안내

**Files:**
- Modify: `apps/web/app/(app)/_components/Nav.tsx` (또는 유사 Nav 컴포넌트)
- Modify: `apps/web/app/(app)/wiki/graph/page.tsx` (빈 상태 fallback 추가)

- [ ] **Step 1: Nav에 링크 추가**

Find Nav component:
```bash
grep -rn "/ask\|/knowledge" apps/web/app --include="*.tsx" | grep -i "link\|href" | head -10
```

그 파일에 링크 추가 (예시 — 실제 구조에 맞춰 조정):
```tsx
<NavLink href="/wiki/graph">Wiki 그래프</NavLink>
<NavLink href="/architecture">아키텍처</NavLink>
```

- [ ] **Step 2: 빈 상태 UI**

Edit `apps/web/app/(app)/wiki/graph/page.tsx`: 데이터 0 row일 때 문구 변경:
```tsx
{pages.length === 0 ? (
  <div className="empty-state">
    <h2>아직 위키 그래프가 비어있어요</h2>
    <p>관리자가 <code>pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis</code>를 실행하면 페이지 링크 그래프가 표시됩니다.</p>
  </div>
) : (
  <GraphViewer data={pages} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(app)/_components/Nav.tsx apps/web/app/(app)/wiki/graph/page.tsx
git commit -m "feat(ui): expose /wiki/graph + /architecture in nav

Both viewers already exist (vis-network). Add nav links and empty-state
hints pointing to reproject/graphify scripts."
```

---

## Task 14: UI `/architecture` 빈 상태 + graphify 스냅샷 목록

**Files:**
- Modify: `apps/web/app/(app)/architecture/page.tsx`

- [ ] **Step 1: 현재 로직 확인**

```bash
head -80 apps/web/app/(app)/architecture/page.tsx
```

- [ ] **Step 2: 빈 상태 UI + 업로드 유도**

graph_snapshot 0 rows일 때:
```tsx
<div className="empty-state">
  <h2>Graphify 스냅샷이 없어요</h2>
  <p>EHR 4/5 소스를 업로드하려면 Path B 가이드 참조:</p>
  <ul>
    <li>scripts/graphify-postprocess.ts 실행 후</li>
    <li>wiki-reproject 재실행</li>
  </ul>
  <a href="/docs/graphify-import">자세히</a>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(app)/architecture/page.tsx
git commit -m "feat(ui): architecture page empty-state with Graphify import guide"
```

---

## Task 15: `scripts/graphify-postprocess.ts` 작성 (Path B 지원)

**Files:**
- Create: `scripts/graphify-postprocess.ts`
- Create: `scripts/tests/graphify-postprocess.test.ts`

- [ ] **Step 1: Write failing test**

Create `scripts/tests/graphify-postprocess.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addFrontmatter, inferKind, detectModule } from "../graphify-postprocess.js";

describe("addFrontmatter", () => {
  it("adds Jarvis-compatible frontmatter to raw Graphify markdown", () => {
    const raw = `# P_HRI_AFTER_PROC_EXEC\n\nSome body\n`;
    const out = addFrontmatter(raw, {
      name: "P_HRI_AFTER_PROC_EXEC",
      module: "HRM",
      kind: "procedure",
      source: "ehr5/procedures/hri/after_proc_exec.sql",
    });

    expect(out).toContain("---\n");
    expect(out).toContain('title: "P_HRI_AFTER_PROC_EXEC"');
    expect(out).toContain("type: derived");
    expect(out).toContain("authority: auto");
    expect(out).toContain("domain: code/HRM");
    expect(out).toContain('module: HRM');
    expect(out).toContain('kind: procedure');
    expect(out).toContain("aliases:");
  });

  it("includes 3 default aliases (identifier + kind 한국어 + module tag)", () => {
    const out = addFrontmatter("# P_SAL_CALC_EXEC\n", {
      name: "P_SAL_CALC_EXEC",
      module: "CPN",
      kind: "procedure",
      source: "ehr5/procedures/cpn/sal_calc.sql",
    });

    expect(out).toMatch(/- "P_SAL_CALC_EXEC"/);
    expect(out).toMatch(/- ".*프로시저"/);  // kind → 프로시저
    expect(out).toMatch(/- ".*CPN.*"/);  // module
  });
});

describe("inferKind", () => {
  it.each([
    ["P_HRI_SUBMIT", "procedure"],
    ["F_NEXT_APPROVER", "function"],
    ["TB_APPROVAL", "table"],
    ["V_EMPLOYEE_MASTER", "view"],
  ])("%s → %s", (name, expected) => {
    expect(inferKind(name)).toBe(expected);
  });

  it("returns 'unknown' for unrecognized patterns", () => {
    expect(inferKind("randomname")).toBe("unknown");
  });
});

describe("detectModule", () => {
  it("extracts module from path segment (e.g. wiki/jarvis/auto/derived/code/HRM/foo.md → HRM)", () => {
    expect(detectModule("HRM/procedures/foo.md")).toBe("HRM");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
pnpm exec tsx --test scripts/tests/graphify-postprocess.test.ts
```

- [ ] **Step 3: Create `graphify-postprocess.ts`**

```ts
/**
 * scripts/graphify-postprocess.ts
 *
 * Path B helper — Graphify raw output(.md, no frontmatter)을 Jarvis가 인식하는
 * derived/code 페이지로 변환한다.
 *
 * Usage:
 *   pnpm exec tsx scripts/graphify-postprocess.ts \
 *     --input ./graphify-out-HRM \
 *     --output wiki/jarvis/auto/derived/code/HRM \
 *     --module HRM \
 *     [--source-prefix ehr5/] \
 *     [--dry-run]
 *
 * Inputs expected:
 *   {input}/pages/*.md        — Graphify raw pages
 *   {input}/graph.json        — graph data (copied to output/_graph-snapshots/)
 *   {input}/graph.html        — optional viewer (copied)
 *
 * Output:
 *   {output}/<kind>/<name>.md — frontmatter 추가된 Jarvis 페이지
 *   {output}/_module.md       — 모듈 entry page (auto-generated)
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const KIND_TO_KOREAN: Record<string, string> = {
  procedure: "프로시저",
  function: "함수",
  table: "테이블",
  view: "뷰",
  class: "클래스",
  interface: "인터페이스",
};

export interface FrontmatterArgs {
  name: string;
  module: string;
  kind: string;
  source: string;
  callees?: string[];
  callers?: string[];
}

export function inferKind(name: string): string {
  if (/^P_/i.test(name)) return "procedure";
  if (/^F_/i.test(name)) return "function";
  if (/^TB_/i.test(name)) return "table";
  if (/^V_/i.test(name)) return "view";
  return "unknown";
}

export function detectModule(relPath: string): string {
  const seg = relPath.split(/[\\/]/)[0];
  return seg ?? "UNKNOWN";
}

export function addFrontmatter(rawBody: string, args: FrontmatterArgs): string {
  const korKind = KIND_TO_KOREAN[args.kind] ?? args.kind;
  const aliases = [
    args.name,
    `${args.name} ${korKind}`,
    `${args.module} ${korKind}`,
  ];
  const linkedPages = (args.callees ?? []).map(
    (c) => `code/${args.module}/${inferKind(c)}s/${c}`,
  );
  const calledBy = (args.callers ?? []).map(
    (c) => `code/${args.module}/${inferKind(c)}s/${c}`,
  );

  const fm = [
    "---",
    `title: "${args.name}"`,
    "type: derived",
    "authority: auto",
    "sensitivity: INTERNAL",
    `domain: code/${args.module}`,
    `source: "${args.source}"`,
    `tags: ["derived/code", "module/${args.module}", "kind/${args.kind}"]`,
    `aliases:`,
    ...aliases.map((a) => `  - "${a}"`),
    `module: ${args.module}`,
    `kind: ${args.kind}`,
    ...(linkedPages.length > 0
      ? [`linkedPages:`, ...linkedPages.map((p) => `  - "${p}"`)]
      : []),
    ...(calledBy.length > 0
      ? [`calledBy:`, ...calledBy.map((p) => `  - "${p}"`)]
      : []),
    "---",
    "",
  ].join("\n");

  return fm + rawBody;
}

async function processFile(
  inputPath: string,
  outputDir: string,
  module: string,
  sourcePrefix: string,
): Promise<void> {
  const raw = await fs.readFile(inputPath, "utf8");
  const name = path.basename(inputPath, ".md");
  const kind = inferKind(name);
  const source = `${sourcePrefix}${module}/${kind}s/${name.toLowerCase()}.sql`;

  const kindDir = path.join(outputDir, `${kind}s`);
  await fs.mkdir(kindDir, { recursive: true });

  const enriched = addFrontmatter(raw, {
    name,
    module,
    kind,
    source,
    // callees/callers extraction from raw body would require parsing — defer to
    // LLM enrichment (ehr-entity-enrichment.md prompt).
  });
  await fs.writeFile(path.join(kindDir, `${name}.md`), enriched, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  };
  const inputDir = getArg("input");
  const outputDir = getArg("output");
  const module = getArg("module");
  const sourcePrefix = getArg("source-prefix") ?? "ehr5/";
  const dryRun = args.includes("--dry-run");

  if (!inputDir || !outputDir || !module) {
    console.error(
      "Usage: graphify-postprocess --input=<dir> --output=<dir> --module=<NAME> [--source-prefix=<pfx>] [--dry-run]",
    );
    process.exit(1);
  }

  const pagesDir = path.join(inputDir, "pages");
  const files = await fs.readdir(pagesDir);
  const mds = files.filter((f) => f.endsWith(".md"));
  console.log(`[postprocess] found ${mds.length} Graphify pages in ${pagesDir}`);

  if (dryRun) {
    console.log("[postprocess] --dry-run set, no writes");
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });
  for (const f of mds) {
    await processFile(path.join(pagesDir, f), outputDir, module, sourcePrefix);
  }

  // Copy graph.json for /architecture viewer
  const graphJsonSrc = path.join(inputDir, "graph.json");
  const graphJsonDst = path.join(outputDir, "_graph-snapshots", "graph.json");
  try {
    await fs.mkdir(path.dirname(graphJsonDst), { recursive: true });
    await fs.copyFile(graphJsonSrc, graphJsonDst);
    console.log(`[postprocess] copied graph.json → ${graphJsonDst}`);
  } catch {
    console.log(`[postprocess] no graph.json in ${inputDir}, skipping`);
  }

  console.log(`[postprocess] done: ${mds.length} pages written to ${outputDir}`);
}

// Invoked as CLI?
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
pnpm exec tsx --test scripts/tests/graphify-postprocess.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/graphify-postprocess.ts scripts/tests/graphify-postprocess.test.ts
git commit -m "feat(scripts): graphify-postprocess for Path B import

Adds Jarvis frontmatter (type:derived, domain:code/\${module}, aliases,
tags, module, kind, linkedPages) to Graphify raw markdown output.
Organizes by kind (procedures/, functions/, tables/, views/) under
wiki/jarvis/auto/derived/code/\${module}/.

Usage: pnpm exec tsx scripts/graphify-postprocess.ts \\
  --input ./graphify-out-HRM --output wiki/jarvis/auto/derived/code/HRM \\
  --module HRM"
```

---

## Task 16: LLM 의미 풍부화 프롬프트 문서

**Files:**
- Create: `prompts/enrichment/ehr-entity-enrichment.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p prompts/enrichment
```

- [ ] **Step 2: Prompt 문서 작성**

Create `prompts/enrichment/ehr-entity-enrichment.md`:
```markdown
# EHR Entity Enrichment Prompt

> Graphify Path B 후처리용. 사용자가 Graphify raw output + `graphify-postprocess.ts`
> 돌린 결과를 더 의미있게 만들기 위해 LLM에 1-pass 돌린다. 모델: gpt-5.4-mini
> (CLIProxy 구독 또는 직결).

## Role
You enrich Graphify-extracted EHR code entities for the Jarvis wiki.

## Input (per entity)
- **name** — identifier (e.g., `P_HRI_AFTER_PROC_EXEC`)
- **kind** — procedure / function / table / view
- **module** — HRM / CPN / TIM / SYS / ORG / ...
- **source snippet** — 20-50 lines around the definition, comments preserved
- **Graphify edges** — callers[], callees[], references[]

## Output (Markdown with YAML frontmatter)

```yaml
---
title: "{name}"
type: derived
authority: auto
sensitivity: INTERNAL
domain: code/{module}
source: "{source path}"
tags: ["derived/code", "module/{module}", "kind/{kind}"]
aliases:
  - "{name}"
  - "{한국어 비즈니스 개념, 주석에서 추출}"
  - "{영문 phrase, 2-3단어}"
module: {module}
kind: {kind}
linkedPages:
  - "code/{module}/{kind}s/{callee}"
---

# {name}

## Purpose
<1-2 sentence Korean summary extracted from comment block. 주석이 없으면 signature에서 추론.>

## Signature
```sql
<exact signature from source>
```

## Calls
- [[code/{module}/{kind}s/{callee}]] — <1-line why, Korean>
- ...

## Called by
- [[code/{module}/{kind}s/{caller}]]
- ...

## Related tables
- [[code/{module}/tables/{table}]] — read | write | both

## Key logic (excerpt)
<10-30 lines of core logic, 주석 preserve. 줄 수가 많으면 핵심 조건문·루프만.>
```

## Rules

1. **Korean comments verbatim** — do NOT translate to English
2. **Aliases ≥ 3 required**:
   - (a) the identifier as-is (e.g., `P_HRI_AFTER_PROC_EXEC`)
   - (b) Korean business concept if mentioned in comments (비과세, 통상임금, 신청서 후처리 etc.)
   - (c) English phrase describing purpose (e.g., "HRI after-form processing")
3. **Never fabricate caller/callee relationships** — use ONLY Graphify-extracted edges. If Graphify says "callees: [F_X, TB_Y]" you include exactly those.
4. **If purpose is unclear** — add tag `needs-review` and leave Purpose="AMBIGUOUS — manual review". Defer to review_queue via WIKI-AGENTS.md §3.1 Step D.
5. **Key logic excerpt ≤ 30 lines** — preserve comments, strip blank lines
6. **Preserve parameter comments** in Signature section
7. **Business-term matching**: if identifier contains HRI (HR Interface), SAL (Salary), ATT (Attendance) etc. — map to Korean in aliases

## Batch Usage (사용자용)

```bash
# 1. Graphify raw output 준비 (사용자가 이미 실행)
ls graphify-out-HRM/pages/  # P_HRI_*.md, F_HRI_*.md, TB_*.md

# 2. postprocess로 frontmatter 뼈대 추가 (Jarvis 제공 script)
pnpm exec tsx scripts/graphify-postprocess.ts \
  --input ./graphify-out-HRM \
  --output wiki/jarvis/auto/derived/code/HRM \
  --module HRM

# 3. 본 prompt로 enrichment (사용자 or Jarvis 배치)
# 옵션 (a): Claude Code로 일괄 처리
#   각 파일을 읽고 이 prompt로 rewrite
# 옵션 (b): OpenAI batch API (cheap)
#   per-entity ~$0.001 via gpt-5.4-mini

# 4. wiki-reproject 재실행
pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis
```

## 예상 비용 (1000 entity 기준)

| 방식 | 비용 | 시간 |
|---|---|---|
| CLIProxy 구독 (gpt-5.4-mini) | $0 (Pro 할당) | 20-40분 |
| 직결 gpt-5.4-mini | ~$1 | 20-40분 |
| Claude Code 수동 | $0 | 반나절 |
```

- [ ] **Step 3: Commit**

```bash
git add prompts/enrichment/ehr-entity-enrichment.md
git commit -m "docs(prompt): EHR entity enrichment prompt for Graphify Path B

Used by user after graphify-postprocess.ts to add Korean business-term
aliases, Purpose summary, and preserved comments. Gpt-5.4-mini via
CLIProxy (subscription) or direct, ~\$1 per 1000 entities."
```

---

## Task 17: (사용자 트랙) EHR5 Graphify 수동 실행

> **담당: 사용자님**. 제가 스크립트·프롬프트 제공했으므로 이후는 사용자 주도.

**Steps (가이드):**

- [ ] 사용자가 EHR5 소스를 모듈별 디렉토리로 분리 (HRM/, CPN/, TIM/, SYS/, ORG/, ...)
- [ ] 모듈별로 Graphify 실행:
  ```bash
  graphify scan --input /path/ehr5/HRM --output ./graphify-out-HRM --include "*.sql,*.java"
  ```
- [ ] postprocess:
  ```bash
  pnpm exec tsx scripts/graphify-postprocess.ts \
    --input ./graphify-out-HRM \
    --output wiki/jarvis/auto/derived/code/HRM \
    --module HRM
  ```
- [ ] enrichment (선택 — ehr-entity-enrichment.md prompt 사용)
- [ ] 각 모듈 반복 (CPN, TIM, SYS, ORG...)
- [ ] Task 18로 진행

완료 조건: `wiki/jarvis/auto/derived/code/{모듈}/**/*.md` 파일 다수 + `_graph-snapshots/graph.json`.

---

## Task 18: wiki-reproject 재실행 (derived 페이지 포함)

**Files:**
- No code. Re-run existing script.

- [ ] **Step 1: dry-run으로 derived 페이지 카운트 확인**

Run:
```bash
pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis --dry-run --domain=derived 2>&1 | tail -5
```
Expected: `collected=<N>` where N is EHR entity 파일 수.

- [ ] **Step 2: 실제 실행 (전체)**

Run:
```bash
pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis
```

- [ ] **Step 3: DB 검증**

Run:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT frontmatter->>'domain' AS domain, count(*) FROM wiki_page_index WHERE frontmatter->>'domain' LIKE 'code/%' GROUP BY domain ORDER BY count(*) DESC;"
```
Expected: `code/HRM, code/CPN, ...` 각 모듈당 수백~수천 행.

---

## Task 19: Code-category A-20 재측정

**Files:**
- No code. Eval re-run.

- [ ] **Step 1: Eval 실행**

```bash
pnpm eval:run -- --filter=category:code 2>&1 | tee /tmp/after-graphify-2026-04-20.log
```

- [ ] **Step 2: Delta 기록**

Edit `docs/superpowers/plans/after-c-2026-04-20.md` 또는 신규 `after-graphify-2026-04-20.md`:
- Code category Recall@5 before (0% 예상) → after (??%)
- 승인 게이트: code category Recall@5 ≥ 50% (다른 카테고리보다 완화 — 코드 질문은 원래 어려움)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/after-graphify-2026-04-20.md
git commit -m "test(eval): code category A-20 after Graphify Path B

Recall@5 delta for code questions after EHR4/5 derived pages populated.
P_HRI_AFTER_PROC_EXEC-style identifier questions now routable."
```

---

## Task 20: docs/data 정리 (Phase ε cleanup)

**Files:**
- Delete: `data/canonical/**` (76 files, 중복 확인 후)
- Delete: `data/guidebook/isu-guidebook-*.md` (중복 확인 후)
- Move: `data/cases/stats.md` → `wiki/jarvis/_system/cases-stats.md`
- Move: `data/cases/recluster_spot_check.md` → `wiki/jarvis/_system/`
- Delete: `docs/analysis/04-mindvault.md`
- Delete: `docs/plan/2026-04-19-Jarvis_openai연동가이드.md`
- Delete: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md`
- Move: `docs/plan/2026-04-W{1,2,3}-gate.md` → `docs/plan/_archive/`

- [ ] **Step 1: 중복 확인 스크립트**

```bash
# canonical vs manual 중복 체크
for f in data/canonical/*.md; do
  slug=$(basename "$f" .md | sed 's/-/_/g')
  if find wiki/jarvis/manual -name "*.md" | xargs grep -l "source.*$(basename "$f")" > /dev/null 2>&1; then
    echo "DUP: $f"
  fi
done
```

- [ ] **Step 2: 삭제 + 이동 실행**

```bash
# Delete duplicates
git rm -r data/canonical/
git rm -r data/guidebook/isu-guidebook-*.md
git rm docs/analysis/04-mindvault.md
git rm docs/plan/2026-04-19-Jarvis_openai연동가이드.md
git rm docs/plan/2026-04-17-tsvd999-wiki-pipeline.md

# Move cases/* to wiki _system
mkdir -p wiki/jarvis/_system
git mv data/cases/stats.md wiki/jarvis/_system/cases-stats.md
git mv data/cases/recluster_spot_check.md wiki/jarvis/_system/
git mv data/cases/README.md wiki/jarvis/_system/cases-readme.md

# Archive W-gate docs
mkdir -p docs/plan/_archive
git mv docs/plan/2026-04-W1-gate.md docs/plan/_archive/
git mv docs/plan/2026-04-W2-gate.md docs/plan/_archive/
git mv docs/plan/2026-04-W3-gate.md docs/plan/_archive/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(cleanup): purge duplicates and disposable plans

- data/canonical/** (76 files): superseded by wiki/jarvis/manual/
- data/guidebook/isu-guidebook-*.md: superseded by manual/guidebook/
- data/cases/*.md: moved to wiki/jarvis/_system/
- docs/analysis/04-mindvault.md: WIKI-AGENTS.md:398 폐기 선언
- docs/plan/2026-04-19-Jarvis_openai연동가이드.md: cliproxy-todo P3 per-design
- docs/plan/2026-04-17-tsvd999-wiki-pipeline.md: executed + disposable
- docs/plan/2026-04-W*-gate.md: moved to _archive/ for audit trail"
```

---

## Task 21: Self-definition drift 수정 + WIKI git 분리

**Files:**
- Modify: `WIKI-AGENTS.md` (5000명 → 100 pilot 소프트 버전)
- Modify: `.env.example` (flag drift 확인)
- Create: `wiki/jarvis/.git/` (별도 repo)

- [ ] **Step 1: WIKI-AGENTS.md 자기정의 업데이트**

Edit `WIKI-AGENTS.md:247`:
```
# 기존:
# Karpathy 원본은 단일 사용자 가정. Jarvis는 5000명 멀티테넌트.

# 수정:
# Karpathy 원본은 단일 사용자 가정. Jarvis는 100명 pilot (스키마·RBAC은 5000명 확장 전제).
```

- [ ] **Step 2: FEATURE_GRAPHIFY_DERIVED_PAGES 값 통일**

`.env.example:92` 확인 — 현재 `false`. Task 18 이후에도 `.env.example`은 기본값 `false` 유지 (OK). `WIKI-AGENTS.md:301`은 `true`로 명시되어 있으나, 이는 "활성 시 경로"를 의미하므로 변경 불필요.

- [ ] **Step 3: wiki/jarvis/ 별도 git repo**

```bash
cd wiki/jarvis
git init
git add .
git commit -m "initial wiki snapshot for pilot"
cd ../..

# Jarvis 메인 .gitignore 업데이트
echo "wiki/jarvis/" >> .gitignore
git add .gitignore
```

- [ ] **Step 4: Commit (메인 repo)**

```bash
git commit -m "chore(wiki): separate wiki/jarvis/ into independent git repo

Aligns with WIKI-AGENTS.md §6 (workspace당 독립 git). Dev iterations
don't pollute Jarvis main PRs. Release: tag in wiki git + pull on prod
server + rerun wiki-reproject."
```

---

## Task 22: ask.ts 삭제 + FEATURE_RAW_CHUNK_QUERY 잔재 제거

**Files:**
- Delete: `packages/ai/ask.ts`
- Modify: `packages/ai/index.ts` (export 정리)
- Modify: `apps/web/app/api/ask/route.ts` (askAI import 경로)
- Grep/clean: `FEATURE_RAW_CHUNK_QUERY` 잔재

- [ ] **Step 1: 의존성 grep**

```bash
grep -rn "from.*ai/ask[\"']" packages/ apps/ --include="*.ts" --include="*.tsx"
grep -rn "FEATURE_RAW_CHUNK_QUERY" . --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.json"
```

- [ ] **Step 2: `askAI` 참조를 `pageFirstAsk`로 대체**

`apps/web/app/api/ask/route.ts`에서 `askAI` 호출을 `pageFirstAsk`로 변경. (FEATURE_PAGE_FIRST_QUERY=true 항상 유효이므로 legacy askAI 경로는 더 이상 필요 없음.)

- [ ] **Step 3: ask.ts 삭제**

```bash
git rm packages/ai/ask.ts packages/ai/ask.test.ts packages/ai/__tests__/ask*.test.ts
```

- [ ] **Step 4: 테스트 재검증**

```bash
pnpm --filter=@jarvis/ai test
pnpm --filter=@jarvis/web test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ai): remove legacy ask.ts after page-first cutover

FEATURE_RAW_CHUNK_QUERY=false 영구 확정. WIKI-AGENTS.md §8의
'legacy, 사용 중지' 선언 후 미단성 코드 제거. pageFirstAsk가 유일
진입점."
```

---

## Task 23: Disposable docs 삭제 (compass 관련)

**Files:**
- Delete: `C:\Users\kms\Downloads\compass_artifact_wf-*.md` (사용자 로컬, Jarvis 저장소 밖 — 삭제 지시 문서로만)
- Delete: `docs/plan/2026-04-19-cliproxy-todo.md` (cliproxy cutover 완료 후)

- [ ] **Step 1: cliproxy-todo 완료 확인**

`docs/plan/2026-04-19-cliproxy-todo.md`의 P0/P1 체크박스 재확인. Task 4에서 거의 커버됨. P1 sops 암호화 부분은 운영 배포 시점으로 미뤄도 OK — 그 경우 해당 줄만 `docs/plan/_archive/`로 유지.

- [ ] **Step 2: cliproxy-todo가 완전 완료됐으면 삭제**

```bash
git rm docs/plan/2026-04-19-cliproxy-todo.md
```

미완 항목(sops 암호화 등)이 남았으면 대신 archive:
```bash
git mv docs/plan/2026-04-19-cliproxy-todo.md docs/plan/_archive/2026-04-19-cliproxy-todo-partial.md
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(docs): archive cliproxy follow-up after subscription cutover"
```

---

## Final Checklist

**Phase α (Baseline)** — Task 1~6
- [ ] DB ready (workspace 'jarvis', snippet 컬럼)
- [ ] build-wiki-index + wiki-reproject 실행 (1333 rows)
- [ ] CLIProxy gateway healthy + FEATURE_SUBSCRIPTION_QUERY=true
- [ ] A-20 fixture 20개 추가
- [ ] Baseline 수치 기록

**Phase γ (C 구현)** — Task 7~12
- [ ] catalog.ts (+ tests)
- [ ] domain-infer.ts (+ tests)
- [ ] llm-shortlist.ts (+ tests)
- [ ] index.ts 재배선 + flag 분기
- [ ] E2E 테스트 통과
- [ ] A-20 재측정 Recall@5 +10% 이상

**Phase β (UI)** — Task 13~14 (병렬)
- [ ] /wiki/graph nav 노출
- [ ] /architecture nav 노출

**Phase δ (Graphify)** — Task 15~19
- [ ] graphify-postprocess.ts 스크립트
- [ ] ehr-entity-enrichment.md 프롬프트
- [ ] (사용자) EHR5 수동 Graphify 실행
- [ ] reproject 재실행
- [ ] Code-category A-20 Recall@5 ≥ 50%

**Phase ε (Cleanup)** — Task 20~23 (병렬)
- [ ] docs/data 정리
- [ ] self-def drift 수정 + wiki git 분리
- [ ] ask.ts 삭제
- [ ] disposable docs 삭제

**Acceptance (운영 flag on 가능 조건):**
- [ ] A-20 Recall@5 ≥ 80% (category balanced)
- [ ] A-20 Quality ≥ 0.7 평균
- [ ] A-20 Grounding 100%
- [ ] 모든 test suite PASS
- [ ] type-check PASS
- [ ] 3개 rollback flag 동작 검증

---

## Notes

- **병렬 dispatch 권장 지점**: Phase γ (Task 7,8,9 동시), Phase β (Task 13,14 동시), Phase ε (Task 20,21,22,23 동시).
- **사용자 병렬 트랙**: Task 17 (Graphify)는 내가 Phase γ 진행 중에 사용자님이 동시 작업.
- **롤백 포인트**: 각 Task 종료 후 커밋 — 실패하면 해당 커밋만 revert.
- **경계 케이스**:
  - `wiki/jarvis/manual/policies/leave-vacation.md`에 "빙부상" alias가 실제로 있는지 reproject 전에 grep으로 확인 필요. 없으면 Phase δ 종료 후 review_queue 경유로 사람이 채워야 함.
  - Graphify가 1000+ entity를 뱉으면 catalog 15K token cap 초과 위험 — `domain-infer.ts`의 code identifier pattern이 동작하는지 eval-038로 검증.
