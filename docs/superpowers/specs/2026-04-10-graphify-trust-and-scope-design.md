# Graphify Integration — Trust & Scope Hardening (Series 1)

**Date:** 2026-04-10
**Status:** Design Spec — approved for implementation plan
**Parent work:** `docs/superpowers/plans/2026-04-09-graphify-integration.md` (Phase 0–3 완료, 이 문서는 후속 품질 보강)
**Scope:** P0 correctness only. Discoverability/Depth는 Series 2, ACL/Multimodal은 Series 3.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Non-Goals](#2-non-goals)
3. [Design Decisions Summary](#3-design-decisions-summary)
4. [Section 1 — Schema](#4-section-1--schema)
5. [Section 2 — Retrieval & Picker](#5-section-2--retrieval--picker)
6. [Section 3 — Citation (GraphSourceRef)](#6-section-3--citation-graphsourceref)
7. [Section 4 — KB Upsert](#7-section-4--kb-upsert)
8. [Section 5 — /ask?q= Fix + Build Lifecycle UX](#8-section-5--askq-fix--build-lifecycle-ux)
9. [Section 6 — Test Strategy](#9-section-6--test-strategy)
10. [File Manifest](#10-file-manifest)
11. [Risks & Edge Cases](#11-risks--edge-cases)
12. [Definition of Done](#12-definition-of-done)

---

## 1. Problem Statement

현재 graphify 통합은 파이프라인(업로드 → worker → MinIO/DB → Ask AI → Architecture)이 올바르게 배선되어 있고 방향도 맞다. 다만 운영에서 오래 버틸 제품 형태로 가기 위해 다음 5가지 정확성 이슈를 먼저 해결해야 한다:

| # | 현재 문제 | 근거 파일 |
|---|----------|----------|
| P0-1 | Ask AI가 workspace의 **최신 snapshot 1개**만 선택 — A 레포 질문에 B 레포 graph가 섞일 수 있음 | `packages/ai/graph-context.ts:55-65` |
| P0-2 | graph context를 썼을 때 **사용자에게 근거가 보이지 않음** — `SourceRef` 타입이 text only | `packages/ai/types.ts:3-9` |
| P0-3 | **재빌드마다 KB 문서가 새 page**로 증식 — slug suffix `-1,-2,-3...` 누적 | `apps/worker/src/helpers/import-knowledge.ts:40-53` |
| P0-4 | `SuggestedQuestions`가 `/ask?q=...` 로 이동하지만 **`AskPage`는 searchParam을 읽지 않음** → 질문 자동 실행 안 됨 | `apps/web/app/(app)/ask/page.tsx:1-62`, `SuggestedQuestions.tsx:26` |
| P0-5 | Architecture 페이지가 `buildStatus='done'`만 표시 — **실행 중/실패 snapshot의 상태/에러가 어디에도 없음** | `apps/web/app/(app)/architecture/page.tsx:27-40` |

한 줄로: 지금은 "graph.html을 보여주는 기능"이고, 이 spec은 그것을 **"snapshot-scoped, citation-aware graph intelligence"** 로 승격시킨다.

---

## 2. Non-Goals

이 spec은 의도적으로 다음을 다루지 **않는다.** (각각 어느 시리즈에 속하는지 명시.)

| 항목 | 시리즈 |
|------|--------|
| Search UNION 통합 (PgSearchAdapter가 graph도 검색) | Series 2 |
| `pg_trgm` 기반 node similarity 인덱스 | Series 2 |
| Shortest-path CTE의 양방향 탐색 | Series 2 |
| Sidebar에 `/architecture` 링크 노출 | Series 2 |
| Large-graph app-native JSON explorer (iframe 대체) | Series 2 |
| `graph_snapshot.sensitivity` + ACL 상속 | Series 3 |
| Non-archive 코퍼스 빌더 (PDF/이미지) | Series 3 |
| Hyperedge/ambiguity/surprising connections UI | Series 3 |
| Graphify 원본 분석 결과 전량 보존 (god_nodes를 재계산하지 않고 그대로 사용) | Series 3 |
| SSE/polling 기반 실시간 빌드 상태 | Series 2+ |
| 에러 snapshot 재시도 버튼 | Series 2 |
| Graph source confidence scoring (MVP는 0.7 고정) | Series 2 |
| `/architecture?node=<id>` 딥링크 하이라이트 실제 구현 | Series 2 (URL은 지금 만들지만 viewer 포커스는 없음) |

---

## 3. Design Decisions Summary

| 결정 | 선택 | 사유 |
|------|------|------|
| Snapshot scope 모델 | `scopeType` enum(`attachment|project|system|workspace`) + `scopeId` uuid | 현재는 attachment/workspace만 쓰지만 project/system 확장 대비 |
| Ask AI picker 규칙 | explicit scope > 키워드 스코어 auto-pick > null | 잘못된 graph를 우연히 섞는 것을 구조적으로 차단 |
| Citation 표현 | `SourceRef`를 discriminated union으로 전환, `GraphSourceRef` variant 추가, 기존 source 목록에 선형 통합 | text/graph를 같은 인덱스 공간에 두어 `[source:N]` 인용 단일화 |
| KB external key | `knowledge_page`에 `sourceType` + `sourceKey` 두 컬럼 추가, `UNIQUE(workspaceId, sourceType, sourceKey)` partial index | 재사용 가능한 외부 아이덴티티, upsert 자연스러움 |
| 재빌드 시 동작 | 같은 sourceKey → 새 version; 같은 content → no-op | 비용 최소화 + history 보존 + 사용자 수기 편집 보호 |
| Build lifecycle 노출 | Architecture 페이지 최상단 전용 섹션 + selector가 모든 상태 포함 | SSR 한 번에 끝, 실시간은 Series 2 |
| `/ask?q=` 동작 | searchParams를 서버에서 읽어 `initialQuestion`으로 전달, `snapshot` 파라미터는 서버에서 검증 후 `initialScope` Badge로 | 이미 `AskPanel`이 auto-run을 지원 — 배선만 하면 됨 |
| Approach | 단일 spec · 단일 PR (Approach A) | 5개 이슈 의존성 강함, pre-prod라 리스크 낮음 |

---

## 4. Section 1 — Schema

### 4.1 목표
- `graph_snapshot`에 "어떤 대상에 대한 스냅샷인지" 명시
- `knowledge_page`에 외부 아이덴티티를 부여하여 upsert 가능
- 둘 다 partial unique index로 무결성 강제

### 4.2 `packages/db/schema/graph.ts` 변경

```ts
export const graphScopeTypeEnum = pgEnum('graph_scope_type', [
  'attachment',   // scopeId = raw_source.id
  'project',      // scopeId = project.id (미래)
  'system',       // scopeId = system.id (미래)
  'workspace',    // scopeId = workspace.id (수동/레거시)
]);

// graph_snapshot 테이블에 추가:
scopeType: graphScopeTypeEnum('scope_type').notNull().default('workspace'),
scopeId:   uuid('scope_id').notNull(),
// 인덱스:
scopeIdx: index('idx_graph_snapshot_scope')
  .on(table.workspaceId, table.scopeType, table.scopeId, table.buildStatus),
```

**FK 없음:** scopeType에 따라 참조 테이블이 다르므로 논리 FK. DELETE 전파는 애플리케이션 레벨(upload 삭제 시 snapshot 정리 job)이 담당.

### 4.3 `packages/db/schema/knowledge.ts` 변경

```ts
// knowledge_page 테이블에 추가:
sourceType: varchar('source_type', { length: 50 }),     // nullable
sourceKey:  varchar('source_key',  { length: 1000 }),   // nullable
// partial unique:
externalKeyIdx: uniqueIndex('idx_knowledge_page_external_key')
  .on(table.workspaceId, table.sourceType, table.sourceKey)
  .where(sql`source_type IS NOT NULL`),
```

**sourceKey 포맷 (graphify 한정):**
```
`${scopeType}:${scopeId}:${artifactPath}`
예: 'attachment:7f3e1234-...:GRAPH_REPORT.md'
예: 'attachment:7f3e1234-...:wiki/00_INDEX.md'
```
**snapshotId는 sourceKey에 포함하지 않는다** — 재빌드 시 snapshotId가 바뀌어도 같은 sourceKey가 유지되어야 upsert가 작동.

### 4.4 마이그레이션 파일 `packages/db/drizzle/0004_graphify_scope_and_upsert.sql`

```sql
-- enum
CREATE TYPE graph_scope_type AS ENUM ('attachment','project','system','workspace');

-- graph_snapshot 확장
ALTER TABLE graph_snapshot
  ADD COLUMN scope_type graph_scope_type NOT NULL DEFAULT 'workspace',
  ADD COLUMN scope_id   uuid;

UPDATE graph_snapshot
SET scope_type = CASE WHEN raw_source_id IS NOT NULL THEN 'attachment'::graph_scope_type
                      ELSE 'workspace'::graph_scope_type END,
    scope_id   = COALESCE(raw_source_id, workspace_id);

ALTER TABLE graph_snapshot ALTER COLUMN scope_id SET NOT NULL;

CREATE INDEX idx_graph_snapshot_scope
  ON graph_snapshot (workspace_id, scope_type, scope_id, build_status);

-- knowledge_page 확장
ALTER TABLE knowledge_page
  ADD COLUMN source_type varchar(50),
  ADD COLUMN source_key  varchar(1000);

CREATE UNIQUE INDEX idx_knowledge_page_external_key
  ON knowledge_page (workspace_id, source_type, source_key)
  WHERE source_type IS NOT NULL;
```

### 4.5 해결되는 이슈
- P0-1 기반 확보 (Section 2에서 picker가 이 컬럼을 씀)
- P0-3 기반 확보 (Section 4에서 upsert가 이 unique index를 씀)

---

## 5. Section 2 — Retrieval & Picker

### 5.1 목표
- `retrieveRelevantGraphContext()`가 "어떤 snapshot"을 쓸지 똑똑하게 고름
- 규칙: **explicit scope > 키워드 스코어 auto-pick > null**
- Ask API → orchestrator → retrieval까지 snapshot 결정 경로를 일관화

### 5.2 `packages/ai/graph-context.ts` 시그니처 확장

```ts
export interface RetrieveGraphContextOptions {
  explicitSnapshotId?: string;
  minMatchThreshold?: number;  // default 2
}

// GraphContext에 snapshotId를 포함시킨다 (Section 3에서 필요)
export interface GraphContext {
  snapshotId: string;            // NEW
  snapshotTitle: string;         // NEW
  matchedNodes: GraphNodeResult[];
  paths: GraphPath[];
  communityContext: string;
}

export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
  options: RetrieveGraphContextOptions = {},
): Promise<GraphContext | null>;
```

### 5.3 Picker 알고리즘

**Step A — Explicit scope path:**
```ts
if (options.explicitSnapshotId) {
  const [row] = await db.select({ id: graphSnapshot.id, title: graphSnapshot.title })
    .from(graphSnapshot)
    .where(and(
      eq(graphSnapshot.id, options.explicitSnapshotId),
      eq(graphSnapshot.workspaceId, workspaceId),    // tenant 격리
      eq(graphSnapshot.buildStatus, 'done'),
    ))
    .limit(1);
  if (!row) return null;   // invalid/cross-tenant/non-done → null
  // ... 선택된 snapshot으로 기존 로직 진행
}
```

**Step B — Auto-pick path (explicit 없을 때):** 단일 쿼리로 workspace 전체 스코어링

```sql
WITH keyword_matches AS (
  SELECT gn.snapshot_id,
         COUNT(DISTINCT gn.node_id) AS match_count
  FROM graph_node gn
  JOIN graph_snapshot gs ON gs.id = gn.snapshot_id
  WHERE gs.workspace_id = $1
    AND gs.build_status = 'done'
    AND gn.label ILIKE ANY($2::text[])
  GROUP BY gn.snapshot_id
)
SELECT km.snapshot_id, gs.title
FROM keyword_matches km
JOIN graph_snapshot gs ON gs.id = km.snapshot_id
WHERE km.match_count >= $3       -- default 2
ORDER BY km.match_count DESC, gs.created_at DESC
LIMIT 1;
```

**Step C — "workspace 최신 1개" fallback 완전 제거.** 이것이 P0-1 근본 원인.

### 5.4 `packages/ai/ask.ts` 연동

`AskQuery`에 `snapshotId?: string` 추가. 병렬 retrieval은 그대로 유지:
```ts
const [claims, graphContext] = await Promise.all([
  retrieveRelevantClaims(query.question, query.workspaceId),
  retrieveRelevantGraphContext(query.question, query.workspaceId, {
    explicitSnapshotId: query.snapshotId,
  }),
]);
```

### 5.5 `apps/web/app/api/ai/ask/route.ts` — request body 확장

```ts
const bodySchema = z.object({
  question: z.string().min(1),
  snapshotId: z.string().uuid().optional(),
});
```

### 5.6 `apps/web/lib/hooks/useAskAI.ts` — hook API 확장

```ts
ask(question: string, opts?: { snapshotId?: string }): Promise<void>;
```

POST body에 `snapshotId`를 함께 직렬화.

### 5.7 해결되는 이슈
- P0-1 완전 해결: "workspace 최신 1개" fallback이 사라지고 scope 없을 때는 점수 기반으로 최적 snapshot을 고르거나 null

### 5.8 엣지케이스
- 해당 workspace에 snapshot 0개 → null
- explicit id가 다른 workspace 소유 → null + 경고 로그
- explicit id가 `running`/`error` → null
- 모두 threshold 미달 → null (text RAG만으로 답변)
- 키워드가 stopword/짧은 단어로 전부 걸러짐 → null (기존 동작)

---

## 6. Section 3 — Citation (`GraphSourceRef`)

### 6.1 목표
- 답변 모델이 graph 컨텍스트를 썼을 때 UI에서 "어떤 node/path"에서 왔는지 보이게
- `SourceRef`를 discriminated union으로 전환, 기존 text 호환
- SSE 스트림에 graph source도 같은 배열로

### 6.2 `packages/ai/types.ts` — discriminated union

```ts
export type SourceRef = TextSourceRef | GraphSourceRef;

export interface TextSourceRef {
  kind: 'text';
  pageId: string;
  title: string;
  url: string;
  excerpt: string;
  confidence: number;
}

export interface GraphSourceRef {
  kind: 'graph';
  snapshotId: string;
  snapshotTitle: string;
  nodeId: string;
  nodeLabel: string;
  sourceFile: string | null;
  communityLabel: string | null;
  relationPath?: string[];
  url: string;             // /architecture?snapshot=<id>&node=<encoded>
  confidence: number;      // MVP 고정 0.7
}
```

**호환성:** 기존 text source 생성부는 `kind: 'text'` 한 줄만 추가.

### 6.3 `packages/ai/ask.ts` — graph context → source 변환

```ts
function toGraphSourceRefs(ctx: GraphContext): GraphSourceRef[] {
  const nodeSources = ctx.matchedNodes.slice(0, 5).map((n) => ({
    kind: 'graph' as const,
    snapshotId: ctx.snapshotId,
    snapshotTitle: truncate(ctx.snapshotTitle, 60),
    nodeId: n.nodeId,
    nodeLabel: n.label,
    sourceFile: n.sourceFile,
    communityLabel: n.communityLabel,
    url: `/architecture?snapshot=${ctx.snapshotId}&node=${encodeURIComponent(n.nodeId)}`,
    confidence: 0.7,
  }));

  const pathSources = ctx.paths.slice(0, 2).map((p) => ({
    kind: 'graph' as const,
    snapshotId: ctx.snapshotId,
    snapshotTitle: truncate(ctx.snapshotTitle, 60),
    nodeId: `${p.from}->${p.to}`,
    nodeLabel: `${p.from} → ${p.to}`,
    sourceFile: null,
    communityLabel: null,
    relationPath: p.hops,
    url: `/architecture?snapshot=${ctx.snapshotId}`,
    confidence: 0.7,
  }));

  return [...nodeSources, ...pathSources];
}

// 최종 sources 배열 — prompt/UI 인덱스 공간 통합
const sources: SourceRef[] = [...textSources, ...graphSources];
```

### 6.4 프롬프트 업데이트

```
<sources>
  <source idx="1" kind="text" title="...">
    <excerpt>...</excerpt>
  </source>
  <source idx="3" kind="graph" snapshot="..." node="UserService" file="services/user.ts">
    Community: Auth
    Connections: calls → Db, called_by → AuthCtrl
  </source>
</sources>

모든 근거는 `[source:N]` 형식으로 인용하라. graph 소스는 구조적 관계 설명에 사용하라.
```

### 6.5 `apps/web/components/ai/SourceRefCard.tsx` — variant 렌더

```tsx
export function SourceRefCard({ source, index }: Props) {
  if (source.kind === 'graph') {
    return <GraphSourceCard source={source} index={index} />;
  }
  return <TextSourceCard source={source} index={index} />;
}
```

**`GraphSourceCard` 모양:** Network 아이콘 + `[Graph #<index>]` 배지, `<nodeLabel>` 볼드, `<sourceFile>` · `Community: <communityLabel>` 서브라인, relationPath 있으면 `A → B → C` 체인, 카드 전체가 `<Link href={source.url}>` 감쌈.

### 6.6 `ClaimBadge.tsx` — 인덱스 기반 lookup 유지

`sources[sourceNumber - 1]`가 graph variant이면 배지에 "Graph" 표기 추가:
```tsx
const source = sources[sourceNumber - 1];
const label = source?.kind === 'graph' ? `Graph ${sourceNumber}` : `${sourceNumber}`;
```

### 6.7 해결되는 이슈
- P0-2 완전 해결: graph context가 UI의 source 카드로 노출

### 6.8 엣지케이스
- 같은 nodeId가 중복 매치 → `slice(0,5)` 전 dedup
- graph context 있지만 모델이 인용 안 함 → graph source도 그대로 노출(사용자가 모델 miss를 알 수 있게)
- graph만 있고 text 없음 → sources가 graph만으로 구성
- snapshotTitle 비거나 너무 긴 경우 → 60자 ellipsis

---

## 7. Section 4 — KB Upsert

### 7.1 목표
- 재빌드 시 **새 페이지 대신 새 version** 생성
- 내용이 변하지 않았으면 **compile/embed 비용 0**
- slug suffix 누적 영구 중단
- 사용자 수기 편집(`publishStatus`, 소유자 등) 덮어쓰지 않음

### 7.2 `apps/worker/src/helpers/import-knowledge.ts` — 전면 리팩토링

**새 시그니처:**
```ts
export interface ImportKnowledgeParams {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;
  sensitivity: string;
  createdBy: string | null;
  sourceType: string;    // NEW — 'graphify'
  sourceKey: string;     // NEW — `${scopeType}:${scopeId}:${artifactPath}`
}

export interface ImportKnowledgeResult {
  pageId: string;
  wasCreated: boolean;
  wasUpdated: boolean;
  versionNumber: number;
}

export async function importAsKnowledgePage(
  params: ImportKnowledgeParams,
): Promise<ImportKnowledgeResult>;
```

### 7.3 Upsert 로직 (트랜잭션 내부)

```
1. SELECT knowledge_page WHERE workspaceId=? AND sourceType=? AND sourceKey=?  FOR UPDATE
2. 존재하는 경우:
   a. 최신 knowledge_page_version의 mdxContent 조회
   b. content 동일 → { wasCreated:false, wasUpdated:false } 반환, compile 미호출
   c. content 다름 →
      - MAX(version_number) + 1 로 새 version 삽입
      - knowledge_page.updatedAt/title UPDATE (publishStatus/sensitivity/소유자는 불변)
      - wasUpdated:true
3. 미존재인 경우:
   a. slug 충돌 확인(타 source와만 충돌 가능) → 필요 시 suffix 재사용
   b. knowledge_page INSERT (sourceType/sourceKey 포함)
   c. knowledge_page_version versionNumber=1 INSERT
   d. wasCreated:true
4. 트랜잭션 커밋 후:
   - wasCreated || wasUpdated → boss.send('compile', { pageId })
   - 둘 다 false → skip (로그 "unchanged, skipping compile")
```

### 7.4 `apps/worker/src/jobs/graphify-build.ts` — sourceKey 계산 및 전달

```ts
const scopeType = snapshot.scopeType;
const scopeId   = snapshot.scopeId;

// GRAPH_REPORT.md
await importAsKnowledgePage({
  ...,
  sourceType: 'graphify',
  sourceKey: `${scopeType}:${scopeId}:GRAPH_REPORT.md`,
});

// wiki/*.md
for (const wikiFile of wikiFiles) {
  const artifactPath = `wiki/${wikiFile.relativePath}`;
  await importAsKnowledgePage({
    ...,
    sourceType: 'graphify',
    sourceKey: `${scopeType}:${scopeId}:${artifactPath}`,
  });
}
```

### 7.5 해결되는 이슈
- P0-3 완전 해결: 동일 sourceKey는 1 page, N versions

### 7.6 엣지케이스
- 같은 pageId 병렬 INSERT 경쟁 → graphify-build `batchSize:1`로 같은 snapshot 병렬 없음. 트랜잭션 내부도 `FOR UPDATE` row lock.
- 사용자가 rebuild 사이에 페이지 unpublish → UPDATE 경로는 `publishStatus` 건드리지 않음
- 이전 빌드에 있던 wiki 파일이 이번 빌드에 빠짐 → 그 page는 그대로 남음(soft-archive 안 함, Series 2에서 cleanup)
- content는 같고 title만 바뀜 → new version 없음, knowledge_page.title만 UPDATE, compile skip

---

## 8. Section 5 — `/ask?q=` Fix + Build Lifecycle UX

### 8.1 목표
- `/ask?q=...&snapshot=<id>` URL이 실제로 질문을 실행하고 graph scope까지 전달
- Architecture 페이지가 pending/running/error/done 모두 드러냄
- 에러/진행중 snapshot을 보고 있을 때 "어디서 막혔는지" 보임

### 8.2 Part A — `/ask?q=` 버그 수정

#### 8.2.1 `apps/web/app/(app)/ask/page.tsx`

```tsx
interface Props {
  searchParams: Promise<{ q?: string; snapshot?: string }>;
}

export default async function AskPage({ searchParams }: Props) {
  const { q, snapshot: snapshotId } = await searchParams;
  // ... 기존 세션/popularQuestions 로직

  let initialScope: { id: string; title: string } | null = null;
  if (snapshotId) {
    const [row] = await db.select({
        id: graphSnapshot.id,
        title: graphSnapshot.title,
      })
      .from(graphSnapshot)
      .where(and(
        eq(graphSnapshot.id, snapshotId),
        eq(graphSnapshot.workspaceId, session.workspaceId),
      ))
      .limit(1);
    if (row) initialScope = row;
  }

  return (
    <AskPanel
      initialQuestion={q ?? ''}
      initialScope={initialScope}
      popularQuestions={popularQuestions}
    />
  );
}
```

#### 8.2.2 `apps/web/components/ai/AskPanel.tsx`

`initialScope` prop 추가, state로 관리, `handleAsk`에서 `ask(question, { snapshotId: activeScope?.id })` 호출. 입력창 위에 Graph scope Badge 표시(제목 + X 버튼으로 clear).

#### 8.2.3 `apps/web/lib/hooks/useAskAI.ts`

`ask(question, opts?: { snapshotId?: string })` 로 시그니처 확장.

### 8.3 Part B — Build Lifecycle UX

#### 8.3.1 `apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx` (신규)

서버 컴포넌트. 상태별 카운트 + 최근 10개의 non-done 빌드 리스트. 각 row는 `/architecture?snapshot=<id>` 링크.

```tsx
const counts = await db
  .select({ status: graphSnapshot.buildStatus, count: count() })
  .from(graphSnapshot)
  .where(eq(graphSnapshot.workspaceId, workspaceId))
  .groupBy(graphSnapshot.buildStatus);

const recentActive = await db
  .select({ id, title, status, createdAt, buildError })
  .from(graphSnapshot)
  .where(and(
    eq(graphSnapshot.workspaceId, workspaceId),
    sql`build_status IN ('pending','running','error')`,
  ))
  .orderBy(desc(graphSnapshot.createdAt))
  .limit(10);
```

각 상태에 StatusChip: running=파랑, pending=회색, error=빨강, done=초록.

#### 8.3.2 `apps/web/app/(app)/architecture/components/BuildStatusCard.tsx` (신규)

Running / Pending / Error 상태를 가진 선택 snapshot을 표시:
- **running:** 스피너 + 경과 시간(createdAt 기준)
- **pending:** 큐 아이콘 + "대기 중"
- **error:** 빨간 박스 + `<pre class="max-h-48 overflow-auto">{buildError}</pre>`

#### 8.3.3 `apps/web/app/(app)/architecture/components/SnapshotSelector.tsx` — 모든 상태 렌더

기존 `done`만 보여주던 selector를 모든 상태 포함으로 변경. 각 option에 상태 아이콘 prefix.

#### 8.3.4 `apps/web/app/(app)/architecture/page.tsx` — 상태별 분기

```tsx
const snapshots = await db.select()
  .from(graphSnapshot)
  .where(eq(graphSnapshot.workspaceId, workspaceId))
  .orderBy(desc(graphSnapshot.createdAt))
  .limit(20);

// 기본 선택: 명시된 id > 최신 done > 최신 아무것
const current =
  (selectedId && snapshots.find((s) => s.id === selectedId)) ??
  snapshots.find((s) => s.buildStatus === 'done') ??
  snapshots[0];

return (
  <main className="p-6 space-y-6">
    <header>... SnapshotSelector ...</header>
    <BuildLifecycleSection workspaceId={workspaceId} />

    {!current && <EmptyState />}

    {current?.buildStatus === 'done' && current.graphHtmlPath && (
      <>
        <GraphViewer snapshotId={current.id} />
        <div className="grid ...">
          <GodNodesCard />
          <BuildInfoCard snapshot={current} />
          <SuggestedQuestions questions={metadata.suggestedQuestions ?? []} />
        </div>
      </>
    )}

    {current?.buildStatus === 'running' && <BuildStatusCard kind="running" ... />}
    {current?.buildStatus === 'pending' && <BuildStatusCard kind="pending" ... />}
    {current?.buildStatus === 'error'   && <BuildStatusCard kind="error"   ... />}
  </main>
);
```

### 8.4 i18n 키 추가 (`apps/web/messages/ko.json`)

```
Architecture.BuildLifecycle.title = "빌드 상태"
Architecture.BuildLifecycle.status.running = "진행 중"
Architecture.BuildLifecycle.status.pending = "대기 중"
Architecture.BuildLifecycle.status.error   = "실패"
Architecture.BuildLifecycle.status.done    = "완료"
Architecture.BuildStatus.running = "'{title}' 빌드가 진행 중입니다."
Architecture.BuildStatus.pending = "'{title}' 빌드가 큐에 있습니다."
Architecture.BuildStatus.error   = "'{title}' 빌드가 실패했습니다."
Architecture.BuildStatus.elapsed = "경과: {seconds}초"
Ask.graphScope   = "Graph 컨텍스트: {title}"
Ask.clearScope   = "Graph 컨텍스트 해제"
```

### 8.5 해결되는 이슈
- P0-4 완전 해결: `/ask?q=` 자동 실행 + scope 전달
- P0-5 완전 해결: 모든 빌드 상태 표시

### 8.6 엣지케이스
- `/ask?q=xyz&snapshot=<invalid>` → Badge 없이 일반 질문으로 실행
- Architecture에 snapshot 0개 → BuildLifecycleSection만 렌더, EmptyState
- `buildError`가 수 KB → `max-h-48 overflow-auto`
- Badge Clear(X) → URL 그대로, React state만 비움

---

## 9. Section 6 — Test Strategy

### 9.1 Layer 1 — Schema / Migration

파일: `packages/db/__tests__/migrations/0004.test.ts` (신규)

- Fresh DB에서 forward migration 정상
- Backfill correctness: `raw_source_id != null` → `scope_type='attachment'`
- 같은 `(workspaceId, 'graphify', sourceKey)` 2번 INSERT → 두 번째가 `23505` unique_violation
- `source_type IS NULL` 페이지는 sourceKey 중복 허용 (레거시 회귀 방지)
- `scope_type='bogus'` → 에러

수동 smoke: `pnpm db:generate` 후 schema drift 훅 통과.

### 9.2 Layer 2 — Retrieval & Picker

파일: `packages/ai/__tests__/graph-context.test.ts` (신규)

- explicit id, workspace 일치, done → 반환
- explicit id, 타 workspace → null
- explicit id, running/error → null
- auto-pick, 2 snapshot 중 하나만 threshold 통과 → 그것
- auto-pick, 둘 다 통과 & 매치 수 다름 → 많은 쪽
- auto-pick, 매치 수 동점 → 최신 createdAt
- auto-pick, 모두 threshold 미달 → null
- 키워드 전부 stopword → null
- 매치 많음(10+) → top 10까지

통합 테스트 `packages/ai/ask.test.ts` 확장:
- `AskQuery.snapshotId`가 graph-context로 정확히 전달
- text RAG는 항상 호출 (graph 유무 무관)

### 9.3 Layer 3 — Citation

파일: `packages/ai/__tests__/source-refs.test.ts` (신규)

- SourceRef union 타입 narrowing 컴파일 통과
- `toGraphSourceRefs` node/path 변환 순서 및 인덱스 안정
- URL 포맷 `/architecture?snapshot=<id>&node=<encoded>`
- Dedup: 동일 nodeId 중복 제거
- snapshotTitle 60자 ellipsis
- text + graph 혼합 시 `[source:N]` 인덱스 정합

컴포넌트: `apps/web/components/ai/__tests__/SourceRefCard.test.tsx`
- text / graph variant 렌더
- relationPath 있을 때 화살표 체인
- URL 링크 가능

### 9.4 Layer 4 — KB Upsert

파일: `apps/worker/__tests__/helpers/import-knowledge.test.ts` (신규 또는 확장)

- 신규 sourceKey → 새 page + v1, `wasCreated:true`
- 기존 sourceKey + 다른 content → new version, `versionNumber:2`
- 기존 sourceKey + 동일 content → no-op, compile 미호출 (spy 검증)
- 사용자가 publishStatus='draft'로 변경 → rebuild 후에도 draft 유지
- slug 충돌(타 source와) → INSERT 경로에서 suffix 재사용
- 트랜잭션 row lock 동작 (직렬 실행 확인)

통합 테스트 — graphify-build 2회 빌드:
- knowledge_page 수 증가 없음
- 첫 빌드 후 unpublish → 재빌드 후에도 unpublished

### 9.5 Layer 5 — E2E Playwright

파일: `apps/web/e2e/ask-scoped.spec.ts`, `apps/web/e2e/architecture-lifecycle.spec.ts` (신규)

- `/ask?q=Foo` → input에 Foo, auto-submit, 스트림 시작
- `/ask?q=Foo&snapshot=<done>` → Badge 표시, sources에 GraphSourceRef 포함
- `/ask?q=Foo&snapshot=<invalid>` → Badge 없음, 질문 실행
- `/ask?q=Foo&snapshot=<other-ws>` → Badge 없음
- Suggested Question 클릭(/architecture → /ask) → 자동 실행 + Badge
- Architecture에 running만 → BuildLifecycleSection + BuildStatusCard(running)
- Architecture에 error 선택 → BuildStatusCard(error)에 buildError 노출
- Selector 상태 구분 확인

테스트 헬퍼 `apps/web/e2e/helpers/graph-fixtures.ts`에 `seedGraphSnapshot(status, scopeType, scopeId, buildError?)` 추가.

### 9.6 테스트 환경 결정
- DB: 프로젝트 기존 관행 따름
- pg-boss: spy 대체 (compile handler 테스트 방식 재사용)
- LLM: 기존 Anthropic client mock 재사용
- E2E snapshot seeding: DB 직접 INSERT (graphify-build 의존성 제거)

---

## 10. File Manifest

### 신규 파일

| Path | Section | Purpose |
|------|---------|---------|
| `packages/db/drizzle/0004_graphify_scope_and_upsert.sql` | 1 | 마이그레이션 SQL |
| `packages/db/__tests__/migrations/0004.test.ts` | 9.1 | 마이그레이션 테스트 |
| `packages/ai/__tests__/graph-context.test.ts` | 9.2 | picker 알고리즘 테스트 |
| `packages/ai/__tests__/source-refs.test.ts` | 9.3 | citation 타입/변환 테스트 |
| `apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx` | 5 | 상태 카운트 + 최근 빌드 리스트 |
| `apps/web/app/(app)/architecture/components/BuildStatusCard.tsx` | 5 | 진행중/대기/에러 상태 카드 |
| `apps/web/components/ai/__tests__/SourceRefCard.test.tsx` | 9.3 | SourceRefCard variant 테스트 |
| `apps/web/e2e/ask-scoped.spec.ts` | 9.5 | /ask?q= E2E |
| `apps/web/e2e/architecture-lifecycle.spec.ts` | 9.5 | lifecycle E2E |
| `apps/web/e2e/helpers/graph-fixtures.ts` | 9.5 | snapshot seeding 헬퍼 |

### 수정 파일

| Path | Section | Change |
|------|---------|--------|
| `packages/db/schema/graph.ts` | 1 | scopeType enum + scopeId 컬럼 + 인덱스 |
| `packages/db/schema/knowledge.ts` | 1 | sourceType/sourceKey 컬럼 + partial unique |
| `packages/ai/types.ts` | 3 | SourceRef → discriminated union, GraphSourceRef 추가 |
| `packages/ai/graph-context.ts` | 2 | 시그니처 확장(options), picker 알고리즘, GraphContext에 snapshotId/Title 추가 |
| `packages/ai/ask.ts` | 2, 3 | AskQuery.snapshotId, toGraphSourceRefs, sources 통합 |
| `packages/ai/ask.test.ts` | 9.2 | snapshotId 전달 + source 통합 검증 |
| `apps/web/app/api/ai/ask/route.ts` | 2 | body에 snapshotId 받기 |
| `apps/web/lib/hooks/useAskAI.ts` | 2 | ask(question, opts) 시그니처 |
| `apps/web/app/(app)/ask/page.tsx` | 5 | searchParams 읽기, initialScope 전달 |
| `apps/web/components/ai/AskPanel.tsx` | 5 | initialScope prop, Badge UI |
| `apps/web/components/ai/SourceRefCard.tsx` | 3 | variant 렌더 (GraphSourceCard 포함) |
| `apps/web/components/ai/ClaimBadge.tsx` | 3 | graph variant 배지 표시 |
| `apps/web/app/(app)/architecture/page.tsx` | 5 | 모든 상태 fetch, 상태별 분기 렌더 |
| `apps/web/app/(app)/architecture/components/SnapshotSelector.tsx` | 5 | 모든 상태 포함, 상태 아이콘 |
| `apps/web/messages/ko.json` | 5 | 새 i18n 키 |
| `apps/worker/src/helpers/import-knowledge.ts` | 4 | 전면 upsert 리팩토링, ImportKnowledgeResult |
| `apps/worker/src/jobs/graphify-build.ts` | 4 | sourceType/sourceKey 계산 및 전달 |
| `apps/worker/__tests__/helpers/import-knowledge.test.ts` | 9.4 | upsert 경로 테스트 |

### 손대지 않는 파일
- `apps/worker/src/helpers/materialize-graph.ts` — hyperedge 처리 개선은 Series 3
- `packages/search/*` — 그래프 검색 UNION은 Series 2
- `apps/web/app/(app)/architecture/components/GraphViewer.tsx` — iframe → JSON explorer 전환은 Series 2
- `apps/web/app/(app)/knowledge/*` — analysis pageType 허브 섹션은 Series 2

---

## 11. Risks & Edge Cases

### R1 — 마이그레이션 실수로 기존 snapshot이 workspace scope로 잘못 묶임
**완화:** backfill SQL을 `0004_*.sql`에 명시적으로 포함, 테스트로 `raw_source_id IS NOT NULL → 'attachment'` 강제 검증. Dev DB만 대상이므로 손실 리스크 낮음.

### R2 — `sourceKey` 길이 초과 (1000자 한도)
**완화:** artifactPath는 wiki/*.md 수준에서 100자 미만이 일반적. UUID(scopeId)는 36자. 합쳐도 ~200자 이내. 한도 충분.

### R3 — Auto-pick threshold가 너무 빡빡/느슨
**완화:** 기본값 2로 시작, 로그에 `match_count`를 남겨 튜닝 기반 확보. 운영 중 조정 가능한 constant로.

### R4 — `toGraphSourceRefs`의 confidence 0.7 고정이 너무 순진함
**완화:** Series 2에서 match count/relation length 기반으로 교체. 현재는 "의미 있는 출처 있음"만 전달.

### R5 — Badge X 클릭 후 URL 불일치(state는 비었지만 URL은 snapshot 유지)
**완화:** 복붙 시 URL 재활성화가 자연스러움. UX상 혼란 없다고 판단. 필요 시 Series 2에서 `router.replace` 추가.

### R6 — KB upsert의 content 동일 비교가 문자열 equality (대용량 MDX에서 비용)
**완화:** 재빌드당 1회 비교, 대부분 wiki 페이지는 수 KB. Series 2에서 SHA-256 컬럼 도입 고려.

### R7 — 병렬 graphify-build 경쟁 (같은 sourceKey)
**완화:** `batchSize:1`로 같은 snapshot의 job은 직렬. 트랜잭션 내부에서 `FOR UPDATE`로 row lock. 다른 snapshot은 sourceKey가 다르므로 무충돌.

---

## 12. Definition of Done

1. `pnpm --filter @jarvis/web type-check` 통과
2. `pnpm --filter @jarvis/ai test`, `@jarvis/db test`, `@jarvis/worker test` 통과
3. `pnpm --filter @jarvis/web e2e` 새 스펙 2개 통과 (Playwright)
4. `pnpm db:generate` → schema drift 훅 조용 (새 migration 포함)
5. Lint 통과
6. 수동 smoke:
   - archive 업로드 → graph 완성 → `/architecture`에서 god_nodes/suggested 보임
   - suggested 클릭 → `/ask`에서 scope Badge + 자동 질의 + graph source 카드
   - 같은 archive 재업로드 → `knowledge_page` row count 동일 (SQL로 확인)
   - 의도적 실패 build(깨진 zip) → `/architecture`에서 error 메시지 확인
7. Series 2/3으로 넘길 항목들은 별도 tracking issue로 이관 (최소 README note)

---

**End of spec.**
