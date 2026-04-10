# Graphify Trust & Scope Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Graphify 통합의 5개 P0 정확성 이슈를 해결하여 "snapshot-scoped, citation-aware graph intelligence"로 승격시킨다.

**Architecture:** 단일 PR로 (1) graph_snapshot에 scopeType/scopeId + knowledge_page에 sourceType/sourceKey 스키마 추가, (2) Ask AI graph picker를 explicit-scope > keyword-score auto-pick로 교체, (3) SourceRef를 discriminated union으로 확장, (4) import-knowledge를 upsert로, (5) /ask?q=...&snapshot=... URL 경로 복구, (6) Architecture 페이지에 빌드 lifecycle 노출.

**Tech Stack:** Next.js 15 App Router · Drizzle ORM · PostgreSQL (ENUM + partial unique index) · vitest · Playwright · pg-boss (unchanged) · next-intl

**Parent spec:** `docs/superpowers/specs/2026-04-10-graphify-trust-and-scope-design.md`

---

## Pre-flight Checks

작업 시작 전 한 번만 확인:

- [ ] `git status` 클린 (uncommitted changes 없음)
- [ ] `pnpm install` 완료
- [ ] `pnpm db:migrate` 로 기존 마이그레이션까지 적용 완료
- [ ] 현재 branch: `main` (또는 이 작업 전용 branch)
- [ ] spec 문서 위치: `docs/superpowers/specs/2026-04-10-graphify-trust-and-scope-design.md`

**실제 경로 교정 (spec vs 현실):**
- Ask API route는 **`apps/web/app/api/ask/route.ts`** (spec에 `/api/ai/ask`로 잘못 적혀 있음. 이 plan이 정답).
- `useAskAI.ts`의 fetch target도 `/api/ask`.

---

## File Structure

**신규 파일 (10):**
```
packages/db/drizzle/0004_graphify_scope_and_upsert.sql
packages/db/__tests__/migrations/0004.test.ts
packages/ai/__tests__/graph-context.test.ts
packages/ai/__tests__/source-refs.test.ts
apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx
apps/web/app/(app)/architecture/components/BuildStatusCard.tsx
apps/web/components/ai/__tests__/SourceRefCard.test.tsx
apps/web/e2e/helpers/graph-fixtures.ts
apps/web/e2e/ask-scoped.spec.ts
apps/web/e2e/architecture-lifecycle.spec.ts
```

**수정 파일 (18):**
```
packages/db/schema/graph.ts                — scopeType enum + scopeId column + index
packages/db/schema/knowledge.ts             — sourceType/sourceKey columns + partial unique
packages/ai/types.ts                        — SourceRef discriminated union
packages/ai/graph-context.ts                — picker 알고리즘 + GraphContext 확장
packages/ai/ask.ts                          — snapshotId 전달 + toGraphSourceRefs + 통합 소스
packages/ai/ask.test.ts                     — 기존 테스트 업데이트
apps/web/app/api/ask/route.ts               — body schema에 snapshotId
apps/web/lib/hooks/useAskAI.ts              — ask(question, opts) 시그니처
apps/web/app/(app)/ask/page.tsx             — searchParams q/snapshot 처리
apps/web/components/ai/AskPanel.tsx         — initialScope prop + Badge
apps/web/components/ai/SourceRefCard.tsx    — variant 렌더 (GraphSourceCard)
apps/web/components/ai/ClaimBadge.tsx       — graph variant 라벨
apps/web/app/(app)/architecture/page.tsx    — 모든 상태 fetch + 분기
apps/web/app/(app)/architecture/components/SnapshotSelector.tsx — 모든 상태 + 아이콘
apps/web/messages/ko.json                   — i18n 키 추가
apps/worker/src/helpers/import-knowledge.ts — upsert 리팩토링
apps/worker/src/jobs/graphify-build.ts      — sourceType/sourceKey 계산 전달
apps/worker/__tests__/helpers/import-knowledge.test.ts — (없으면 신규) upsert 테스트
```

---

## Task 1: DB Migration 0004 — graph scope + knowledge external key

**Files:**
- Create: `packages/db/drizzle/0004_graphify_scope_and_upsert.sql`
- Create: `packages/db/__tests__/migrations/0004.test.ts`
- Modify: `packages/db/schema/graph.ts`
- Modify: `packages/db/schema/knowledge.ts`

### Steps

- [ ] **Step 1.1: 기존 drizzle 마이그레이션 포맷 확인**

```bash
cat packages/db/drizzle/0003_*.sql | head -50
```

목적: 0003 파일의 헤더/스타일을 0004에서 동일하게 재사용.

- [ ] **Step 1.2: `packages/db/schema/graph.ts`에 enum + scope 컬럼 추가**

기존 `graphSnapshot` 테이블 정의 맨 위에 enum 추가:

```ts
export const graphScopeTypeEnum = pgEnum('graph_scope_type', [
  'attachment',
  'project',
  'system',
  'workspace',
]);
```

`graphSnapshot` 테이블 컬럼 정의부에 추가 (기존 `rawSourceId` 바로 아래):

```ts
  scopeType: graphScopeTypeEnum('scope_type').notNull().default('workspace'),
  scopeId: uuid('scope_id').notNull(),
```

인덱스 정의부(기존 `workspaceIdx` 아래)에 추가:

```ts
  scopeIdx: index('idx_graph_snapshot_scope').on(
    table.workspaceId,
    table.scopeType,
    table.scopeId,
    table.buildStatus,
  ),
```

- [ ] **Step 1.3: `packages/db/schema/knowledge.ts`에 external key 컬럼 추가**

`knowledgePage` 테이블에 `searchVector` 바로 위에 추가:

```ts
  sourceType: varchar("source_type", { length: 50 }),
  sourceKey: varchar("source_key", { length: 1000 }),
```

같은 파일 상단 import에 `uniqueIndex`, `sql`이 없으면 추가:

```ts
import { sql } from "drizzle-orm";
// uniqueIndex는 이미 있거나, drizzle-orm/pg-core에서 import
import { uniqueIndex } from "drizzle-orm/pg-core";
```

`knowledgePage` 테이블 정의에 테이블 옵션(partial unique index) 추가. 현재 파일에는 없을 수 있으므로 테이블 정의 스타일을 `(table) => ({ ... })` 형태로 마감:

```ts
}, (table) => ({
  externalKeyIdx: uniqueIndex('idx_knowledge_page_external_key')
    .on(table.workspaceId, table.sourceType, table.sourceKey)
    .where(sql`source_type IS NOT NULL`),
}));
```

주의: 기존 `knowledgePage` 정의가 이미 options 함수를 쓰고 있으면 그 안에 붙이기만 하면 됨.

- [ ] **Step 1.4: `pnpm db:generate` 실행으로 drizzle이 SQL 생성하게 함**

```bash
pnpm --filter @jarvis/db db:generate
```

결과: `packages/db/drizzle/0004_<random_name>.sql` 생성. 파일명을 `0004_graphify_scope_and_upsert.sql`로 리네임:

```bash
mv packages/db/drizzle/0004_*.sql packages/db/drizzle/0004_graphify_scope_and_upsert.sql
```

생성된 `packages/db/drizzle/meta/_journal.json`도 새 파일명을 반영하는지 확인 — drizzle이 tag 필드에 파일명을 적는다. 수정 필요 시 tag도 `0004_graphify_scope_and_upsert`로 변경.

- [ ] **Step 1.5: 0004 SQL에 backfill/보정 SQL 수동 추가**

생성된 0004 SQL은 대체로:
```sql
CREATE TYPE "public"."graph_scope_type" AS ENUM (...);
ALTER TABLE "graph_snapshot" ADD COLUMN "scope_type" "graph_scope_type" DEFAULT 'workspace' NOT NULL;
ALTER TABLE "graph_snapshot" ADD COLUMN "scope_id" uuid NOT NULL;
CREATE INDEX "idx_graph_snapshot_scope" ON "graph_snapshot" ...;
ALTER TABLE "knowledge_page" ADD COLUMN "source_type" varchar(50);
ALTER TABLE "knowledge_page" ADD COLUMN "source_key" varchar(1000);
CREATE UNIQUE INDEX "idx_knowledge_page_external_key" ON "knowledge_page" ... WHERE source_type IS NOT NULL;
```

**문제:** `scope_id uuid NOT NULL`이 기존 row에 실패함. drizzle이 기본값 없이 NOT NULL을 넣기 때문.

`ALTER TABLE graph_snapshot ADD COLUMN scope_id uuid NOT NULL` 라인을 3단계로 교체:

```sql
-- graph_snapshot.scope_id: add as nullable, backfill, then enforce NOT NULL
ALTER TABLE "graph_snapshot" ADD COLUMN "scope_id" uuid;

UPDATE "graph_snapshot"
SET "scope_type" = CASE
      WHEN "raw_source_id" IS NOT NULL THEN 'attachment'::"graph_scope_type"
      ELSE 'workspace'::"graph_scope_type"
    END,
    "scope_id" = COALESCE("raw_source_id", "workspace_id");

ALTER TABLE "graph_snapshot" ALTER COLUMN "scope_id" SET NOT NULL;
```

- [ ] **Step 1.6: 실제 DB에 migration 적용 + drift 훅 통과 확인**

```bash
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --hook
```

Expected: migrate 성공, drift 훅 "OK" 출력.

- [ ] **Step 1.7: 마이그레이션 테스트 작성**

`packages/db/__tests__/migrations/0004.test.ts` 신규:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

describe('migration 0004 — graphify scope & upsert', () => {
  it('graph_scope_type enum exists with expected values', async () => {
    const rows = await db.execute<{ enumlabel: string }>(sql`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = 'graph_scope_type'::regtype
      ORDER BY enumsortorder
    `);
    expect(rows.rows.map((r) => r.enumlabel)).toEqual([
      'attachment', 'project', 'system', 'workspace',
    ]);
  });

  it('graph_snapshot has scope_type and scope_id columns', async () => {
    const rows = await db.execute<{ column_name: string; is_nullable: string }>(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'graph_snapshot'
        AND column_name IN ('scope_type', 'scope_id')
      ORDER BY column_name
    `);
    expect(rows.rows).toEqual([
      { column_name: 'scope_id', is_nullable: 'NO' },
      { column_name: 'scope_type', is_nullable: 'NO' },
    ]);
  });

  it('knowledge_page partial unique index allows NULL source_type duplicates', async () => {
    const wsId = randomUUID();
    await db.execute(sql`INSERT INTO workspace (id, name, slug) VALUES (${wsId}, 'test', ${'test-' + wsId.slice(0,8)}) ON CONFLICT DO NOTHING`);
    
    // Two pages with source_type NULL and same slug/title — should both succeed
    await db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status)
      VALUES
        (${randomUUID()}, ${wsId}, 'wiki', 'p1', ${'slug-' + randomUUID().slice(0,8)}, 'draft'),
        (${randomUUID()}, ${wsId}, 'wiki', 'p2', ${'slug-' + randomUUID().slice(0,8)}, 'draft')
    `);
    // If we got here, NULL source_type doesn't trip the partial unique
    expect(true).toBe(true);
  });

  it('knowledge_page partial unique index rejects duplicate (workspace, source_type, source_key)', async () => {
    const wsId = randomUUID();
    await db.execute(sql`INSERT INTO workspace (id, name, slug) VALUES (${wsId}, 'test2', ${'test2-' + wsId.slice(0,8)}) ON CONFLICT DO NOTHING`);
    const srcKey = 'attachment:abc:GRAPH_REPORT.md';

    await db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status, source_type, source_key)
      VALUES (${randomUUID()}, ${wsId}, 'analysis', 'r1', ${'s1-' + randomUUID().slice(0,8)}, 'published', 'graphify', ${srcKey})
    `);

    await expect(db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status, source_type, source_key)
      VALUES (${randomUUID()}, ${wsId}, 'analysis', 'r2', ${'s2-' + randomUUID().slice(0,8)}, 'published', 'graphify', ${srcKey})
    `)).rejects.toThrow(/unique/i);
  });
});
```

- [ ] **Step 1.8: 테스트 실행**

```bash
pnpm --filter @jarvis/db test -- migrations/0004
```

Expected: 4 tests passed.

- [ ] **Step 1.9: Commit**

```bash
git add packages/db/drizzle/0004_graphify_scope_and_upsert.sql packages/db/drizzle/meta/_journal.json packages/db/schema/graph.ts packages/db/schema/knowledge.ts packages/db/__tests__/migrations/0004.test.ts
git commit -m "feat(graphify): add scope columns + knowledge external key (migration 0004)"
```

---

## Task 2: GraphContext 타입 확장 + explicit scope path

**Files:**
- Modify: `packages/ai/graph-context.ts`
- Create: `packages/ai/__tests__/graph-context.test.ts`

### Steps

- [ ] **Step 2.1: 기존 `packages/ai/ask.test.ts`의 mocking 패턴 확인**

```bash
cat packages/ai/ask.test.ts | head -100
```

목적: DB mock 여부, vitest 설정, fixture 스타일 파악.

- [ ] **Step 2.2: 타입 확장 — `GraphContext`에 snapshot 정보 추가**

`packages/ai/graph-context.ts`의 `GraphContext` interface를 수정:

```ts
export interface GraphContext {
  snapshotId: string;          // NEW
  snapshotTitle: string;       // NEW
  matchedNodes: GraphNodeResult[];
  paths: GraphPath[];
  communityContext: string;
}
```

같은 파일에 옵션 타입 추가 (파일 상단, import 다음):

```ts
export interface RetrieveGraphContextOptions {
  explicitSnapshotId?: string;
  minMatchThreshold?: number;
}
```

- [ ] **Step 2.3: 함수 시그니처 확장**

`retrieveRelevantGraphContext`를 옵션 파라미터 받도록:

```ts
export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
  options: RetrieveGraphContextOptions = {},
): Promise<GraphContext | null> {
  // ... (다음 스텝에서 내부 채움)
}
```

- [ ] **Step 2.4: Explicit scope path 구현**

함수 본문에서 기존 "1. Find latest completed snapshot" 블록을 다음과 같이 교체. `snapshot` 변수를 `{id, title}`로 확장:

```ts
  let snapshot: { id: string; title: string } | null = null;

  if (options.explicitSnapshotId) {
    const [row] = await db
      .select({ id: graphSnapshot.id, title: graphSnapshot.title })
      .from(graphSnapshot)
      .where(
        and(
          eq(graphSnapshot.id, options.explicitSnapshotId),
          eq(graphSnapshot.workspaceId, workspaceId),
          eq(graphSnapshot.buildStatus, 'done'),
        ),
      )
      .limit(1);
    if (!row) {
      console.warn(
        `[graph-context] explicit snapshotId=${options.explicitSnapshotId} not found or not accessible for workspace=${workspaceId}`,
      );
      return null;
    }
    snapshot = row;
  } else {
    // TASK 3에서 auto-pick 구현 — 현재는 placeholder
    snapshot = null;
  }

  if (!snapshot) return null;
```

중요: 기존 `const [snapshot] = await db...orderBy(desc).limit(1)` 블록은 **완전히 제거**. fallback은 Task 3에서 auto-pick로 대체.

- [ ] **Step 2.5: 함수 하단에서 snapshot 정보 반환에 포함**

`return { matchedNodes, paths, communityContext };` 를:

```ts
  return {
    snapshotId: snapshot.id,
    snapshotTitle: snapshot.title,
    matchedNodes,
    paths,
    communityContext,
  };
```

그리고 본문 중간 `snapshot.id`를 쓰던 모든 곳(`${snapshot.id}::uuid`)은 그대로 작동 — `snapshot`이 여전히 `{id, title}` 객체이므로.

- [ ] **Step 2.6: 테스트 작성 — explicit scope path**

`packages/ai/__tests__/graph-context.test.ts` 신규:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { retrieveRelevantGraphContext } from '../graph-context';

async function seedSnapshot(opts: {
  workspaceId: string;
  scopeType?: 'attachment' | 'workspace';
  scopeId?: string;
  buildStatus?: 'pending' | 'running' | 'done' | 'error';
  title?: string;
  nodes?: { nodeId: string; label: string }[];
}): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO graph_snapshot (id, workspace_id, title, scope_type, scope_id, build_status, analysis_metadata)
    VALUES (${id}, ${opts.workspaceId}, ${opts.title ?? 'Test Snapshot'},
            ${opts.scopeType ?? 'workspace'}, ${opts.scopeId ?? opts.workspaceId},
            ${opts.buildStatus ?? 'done'}, '{}'::jsonb)
  `);
  for (const n of opts.nodes ?? []) {
    await db.execute(sql`
      INSERT INTO graph_node (snapshot_id, node_id, label, metadata)
      VALUES (${id}, ${n.nodeId}, ${n.label}, '{}'::jsonb)
    `);
  }
  return id;
}

async function seedWorkspace(): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO workspace (id, name, slug)
    VALUES (${id}, 'gc-test', ${'gc-' + id.slice(0,8)})
    ON CONFLICT DO NOTHING
  `);
  return id;
}

describe('retrieveRelevantGraphContext — explicit scope', () => {
  let wsA: string;
  let wsB: string;

  beforeEach(async () => {
    wsA = await seedWorkspace();
    wsB = await seedWorkspace();
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM graph_snapshot WHERE workspace_id IN (${wsA}, ${wsB})`);
    await db.execute(sql`DELETE FROM workspace WHERE id IN (${wsA}, ${wsB})`);
  });

  it('returns context when explicit id is valid, in workspace, and done', async () => {
    const snapshotId = await seedSnapshot({
      workspaceId: wsA,
      nodes: [{ nodeId: 'n1', label: 'UserService' }],
    });

    const ctx = await retrieveRelevantGraphContext('tell me about UserService', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.snapshotId).toBe(snapshotId);
  });

  it('returns null when explicit id belongs to another workspace', async () => {
    const snapshotId = await seedSnapshot({ workspaceId: wsB });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });

  it('returns null when explicit snapshot is in running state', async () => {
    const snapshotId = await seedSnapshot({ workspaceId: wsA, buildStatus: 'running' });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });

  it('returns null when explicit snapshot is in error state', async () => {
    const snapshotId = await seedSnapshot({ workspaceId: wsA, buildStatus: 'error' });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });
});
```

- [ ] **Step 2.7: 테스트 실행**

```bash
pnpm --filter @jarvis/ai test -- graph-context
```

Expected: 4 tests passed (explicit scope block only). Auto-pick는 Task 3에서.

- [ ] **Step 2.8: Commit**

```bash
git add packages/ai/graph-context.ts packages/ai/__tests__/graph-context.test.ts
git commit -m "feat(graphify): add GraphContext scope info + explicit snapshot path"
```

---

## Task 3: Graph context auto-pick path (키워드 스코어 기반)

**Files:**
- Modify: `packages/ai/graph-context.ts`
- Modify: `packages/ai/__tests__/graph-context.test.ts`

### Steps

- [ ] **Step 3.1: `retrieveRelevantGraphContext`에서 auto-pick 블록 구현**

Task 2에서 남긴 `// TASK 3에서 auto-pick 구현` 자리를 다음으로 교체. 주의: 이 블록은 **먼저 키워드를 계산한 뒤**에 실행되어야 하므로, 기존 `extractKeywords`는 `options.explicitSnapshotId` 조건 분기보다 앞으로 옮긴다.

`retrieveRelevantGraphContext` 함수 본문 구조:

```ts
  // 2. Extract keywords (moved up — needed for both explicit and auto-pick paths)
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return null;
  const likePatterns = keywords.map((k) => `%${k}%`);

  // 1. Pick snapshot
  let snapshot: { id: string; title: string } | null = null;

  if (options.explicitSnapshotId) {
    const [row] = await db
      .select({ id: graphSnapshot.id, title: graphSnapshot.title })
      .from(graphSnapshot)
      .where(and(
        eq(graphSnapshot.id, options.explicitSnapshotId),
        eq(graphSnapshot.workspaceId, workspaceId),
        eq(graphSnapshot.buildStatus, 'done'),
      ))
      .limit(1);
    if (!row) {
      console.warn(
        `[graph-context] explicit snapshotId=${options.explicitSnapshotId} not found or not accessible for workspace=${workspaceId}`,
      );
      return null;
    }
    snapshot = row;
  } else {
    // Auto-pick by keyword match score across all done snapshots in workspace
    const threshold = options.minMatchThreshold ?? 2;
    const pickRows = await db.execute<{ snapshot_id: string; title: string; match_count: number }>(sql`
      WITH keyword_matches AS (
        SELECT gn.snapshot_id,
               COUNT(DISTINCT gn.node_id) AS match_count
        FROM graph_node gn
        JOIN graph_snapshot gs ON gs.id = gn.snapshot_id
        WHERE gs.workspace_id = ${workspaceId}::uuid
          AND gs.build_status = 'done'
          AND gn.label ILIKE ANY(${likePatterns}::text[])
        GROUP BY gn.snapshot_id
      )
      SELECT km.snapshot_id, gs.title, km.match_count
      FROM keyword_matches km
      JOIN graph_snapshot gs ON gs.id = km.snapshot_id
      WHERE km.match_count >= ${threshold}
      ORDER BY km.match_count DESC, gs.created_at DESC
      LIMIT 1
    `);
    if (pickRows.rows.length === 0) return null;
    snapshot = { id: pickRows.rows[0]!.snapshot_id, title: pickRows.rows[0]!.title };
  }
```

그리고 기존 함수 본문의 "2. Extract keywords" 블록(약 68번 라인)은 **삭제** (위로 이동했으므로). 기존 "3. Match graph nodes via label ILIKE" 블록은 그대로 유지하되 `likePatterns`가 이미 위에서 선언되었으므로 재선언 제거.

- [ ] **Step 3.2: Auto-pick 테스트 추가**

`packages/ai/__tests__/graph-context.test.ts` 말미에 새 describe 블록 추가:

```ts
describe('retrieveRelevantGraphContext — auto-pick', () => {
  let wsA: string;

  beforeEach(async () => {
    wsA = await seedWorkspace();
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM graph_snapshot WHERE workspace_id = ${wsA}`);
    await db.execute(sql`DELETE FROM workspace WHERE id = ${wsA}`);
  });

  it('picks snapshot with highest keyword match count', async () => {
    const low = await seedSnapshot({
      workspaceId: wsA,
      title: 'low',
      nodes: [{ nodeId: 'x', label: 'UserService' }],
    });
    const high = await seedSnapshot({
      workspaceId: wsA,
      title: 'high',
      nodes: [
        { nodeId: 'a', label: 'UserService' },
        { nodeId: 'b', label: 'UserRepository' },
        { nodeId: 'c', label: 'UserController' },
      ],
    });

    const ctx = await retrieveRelevantGraphContext('tell me about user service and user repository', wsA);

    expect(ctx).not.toBeNull();
    expect(ctx?.snapshotId).toBe(high);
  });

  it('returns null when all snapshots are below threshold', async () => {
    await seedSnapshot({
      workspaceId: wsA,
      nodes: [{ nodeId: 'a', label: 'OnlyOne' }],
    });

    const ctx = await retrieveRelevantGraphContext('onlyone', wsA, { minMatchThreshold: 5 });

    expect(ctx).toBeNull();
  });

  it('tiebreak: picks most recent createdAt when match count ties', async () => {
    const older = await seedSnapshot({
      workspaceId: wsA,
      title: 'older',
      nodes: [
        { nodeId: 'a', label: 'AuthService' },
        { nodeId: 'b', label: 'AuthToken' },
      ],
    });
    // Small delay to make createdAt distinct
    await new Promise((r) => setTimeout(r, 10));
    const newer = await seedSnapshot({
      workspaceId: wsA,
      title: 'newer',
      nodes: [
        { nodeId: 'c', label: 'AuthService' },
        { nodeId: 'd', label: 'AuthToken' },
      ],
    });

    const ctx = await retrieveRelevantGraphContext('auth service token', wsA);

    expect(ctx?.snapshotId).toBe(newer);
  });

  it('returns null when no snapshots exist in workspace', async () => {
    const ctx = await retrieveRelevantGraphContext('anything', wsA);
    expect(ctx).toBeNull();
  });

  it('ignores snapshots in non-done status during auto-pick', async () => {
    await seedSnapshot({
      workspaceId: wsA,
      buildStatus: 'running',
      nodes: [
        { nodeId: 'x', label: 'Widget' },
        { nodeId: 'y', label: 'WidgetFactory' },
      ],
    });

    const ctx = await retrieveRelevantGraphContext('widget factory', wsA);
    expect(ctx).toBeNull();
  });
});
```

- [ ] **Step 3.3: 테스트 실행**

```bash
pnpm --filter @jarvis/ai test -- graph-context
```

Expected: Task 2의 4 + Task 3의 5 = 9 tests passed.

- [ ] **Step 3.4: Commit**

```bash
git add packages/ai/graph-context.ts packages/ai/__tests__/graph-context.test.ts
git commit -m "feat(graphify): add keyword-scored auto-pick for graph context"
```

---

## Task 4: SourceRef discriminated union

**Files:**
- Modify: `packages/ai/types.ts`
- Create: `packages/ai/__tests__/source-refs.test.ts`

### Steps

- [ ] **Step 4.1: `packages/ai/types.ts` 전면 교체**

기존 `SourceRef` interface를 판별 유니온으로:

```ts
// packages/ai/types.ts

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
  url: string;
  confidence: number;
}

export type SourceRef = TextSourceRef | GraphSourceRef;

export interface Claim {
  text: string;
  sourceRefs: SourceRef[];
  confidence: 'high' | 'medium' | 'low';
}

export interface AskResult {
  answer: string;
  claims: Claim[];
  sources: SourceRef[];
  totalTokens: number;
}

export type SSEEventType = 'text' | 'sources' | 'done' | 'error';

export interface SSETextEvent { type: 'text'; content: string }
export interface SSESourcesEvent { type: 'sources'; sources: SourceRef[] }
export interface SSEDoneEvent { type: 'done'; totalTokens: number }
export interface SSEErrorEvent { type: 'error'; message: string }
export type SSEEvent = SSETextEvent | SSESourcesEvent | SSEDoneEvent | SSEErrorEvent;

export interface RetrievedClaim {
  id: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  claimText: string;
  vectorSim: number;
  ftsRank: number;
  hybridScore: number;
}

export interface AskQuery {
  question: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  snapshotId?: string;     // NEW — explicit graph scope
}
```

- [ ] **Step 4.2: 테스트 작성 — 타입 narrowing 컴파일 검증**

`packages/ai/__tests__/source-refs.test.ts` 신규:

```ts
import { describe, it, expect } from 'vitest';
import type { SourceRef, TextSourceRef, GraphSourceRef } from '../types';

describe('SourceRef discriminated union', () => {
  it('narrows to TextSourceRef when kind==="text"', () => {
    const src: SourceRef = {
      kind: 'text',
      pageId: 'p1',
      title: 't',
      url: '/knowledge/p1',
      excerpt: 'e',
      confidence: 0.8,
    };
    if (src.kind === 'text') {
      // @ts-expect-error — pageId should not exist on GraphSourceRef narrowing
      const _ne: GraphSourceRef['nodeId'] = undefined as unknown as string;
      expect(src.pageId).toBe('p1');
    }
  });

  it('narrows to GraphSourceRef when kind==="graph"', () => {
    const src: SourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'snap',
      nodeId: 'n1',
      nodeLabel: 'UserService',
      sourceFile: 'services/user.ts',
      communityLabel: 'Auth',
      url: '/architecture?snapshot=s1&node=n1',
      confidence: 0.7,
    };
    if (src.kind === 'graph') {
      expect(src.nodeLabel).toBe('UserService');
      expect(src.relationPath).toBeUndefined();
    }
  });

  it('GraphSourceRef accepts optional relationPath', () => {
    const src: GraphSourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'snap',
      nodeId: 'a->b',
      nodeLabel: 'A → B',
      sourceFile: null,
      communityLabel: null,
      relationPath: ['A', 'B', 'C'],
      url: '/architecture?snapshot=s1',
      confidence: 0.7,
    };
    expect(src.relationPath).toEqual(['A', 'B', 'C']);
  });
});
```

- [ ] **Step 4.3: 기존 text source 생산부에 `kind: 'text'` 추가**

`packages/ai/ask.ts`의 line 194 근처 `sources: SourceRef[] = ...` 블록에서:

```ts
return [{
  kind: 'text',     // ADD THIS
  pageId: claim.pageId,
  title: claim.pageTitle,
  url: claim.pageUrl,
  excerpt: claim.claimText.slice(0, 200),
  confidence: claim.hybridScore,
}];
```

주의: Task 5에서 이 블록 전체를 다시 손대므로, 지금은 `kind: 'text'` 한 줄만 추가해서 타입 에러를 해소.

- [ ] **Step 4.4: `useAskAI.ts`, `AskPanel.tsx`, `ClaimBadge.tsx`, `SourceRefCard.tsx` 등에서 `SourceRef` 사용처 타입 에러 확인**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/ai type-check 2>/dev/null || pnpm -r type-check
```

`SourceRef.pageId` 같이 discriminator 없이 프로퍼티 접근하는 곳이 있으면 일단 `(source as TextSourceRef).pageId`로 감싸거나, 사용처에서 `if (source.kind === 'text')` 가드 추가.

**최소 수정 원칙:** Task 4에서는 컴파일만 통과시킨다. UI variant 렌더는 Task 11에서 본격 처리.

현재까지 확인된 사용처와 최소 조치:
- `AskPanel.tsx:26-46` `AnswerText` — 인덱스 lookup만 하므로 타입은 OK
- `SourceRefCard.tsx` — 본문에서 `source.pageId` 등을 쓰면 `if (source.kind !== 'text') return null;` 가드 추가 (Task 11에서 본격 렌더)
- `ClaimBadge.tsx` — 인덱스 lookup만 하므로 OK

- [ ] **Step 4.5: 테스트 + 타입체크 실행**

```bash
pnpm --filter @jarvis/ai test -- source-refs
pnpm --filter @jarvis/web type-check
```

Expected: source-refs.test.ts 3 passed, type-check clean.

- [ ] **Step 4.6: Commit**

```bash
git add packages/ai/types.ts packages/ai/__tests__/source-refs.test.ts packages/ai/ask.ts apps/web/components/ai/SourceRefCard.tsx
git commit -m "refactor(ai): convert SourceRef to discriminated union (text | graph)"
```

---

## Task 5: ask.ts — snapshotId propagation + graph source integration

**Files:**
- Modify: `packages/ai/ask.ts`
- Modify: `packages/ai/ask.test.ts`

### Steps

- [ ] **Step 5.1: ask.ts에 `toGraphSourceRefs` 헬퍼 추가**

`packages/ai/ask.ts` 하단(기존 `askAI` 함수 앞)에 추가:

```ts
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function toGraphSourceRefs(ctx: GraphContext): import('./types.js').GraphSourceRef[] {
  const title = truncate(ctx.snapshotTitle, 60);
  const seen = new Set<string>();
  const nodeSources = ctx.matchedNodes
    .filter((n) => {
      if (seen.has(n.nodeId)) return false;
      seen.add(n.nodeId);
      return true;
    })
    .slice(0, 5)
    .map((n) => ({
      kind: 'graph' as const,
      snapshotId: ctx.snapshotId,
      snapshotTitle: title,
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
    snapshotTitle: title,
    nodeId: `${p.from}->${p.to}`,
    nodeLabel: `${p.from} → ${p.to}`,
    sourceFile: null as string | null,
    communityLabel: null as string | null,
    relationPath: p.hops,
    url: `/architecture?snapshot=${ctx.snapshotId}`,
    confidence: 0.7,
  }));

  return [...nodeSources, ...pathSources];
}
```

import에 `GraphSourceRef` 타입도 같이 가져오도록 `types.js` import 교체:

```ts
import type { SSEEvent, SourceRef, TextSourceRef, GraphSourceRef, RetrievedClaim } from './types.js';
```

- [ ] **Step 5.2: `generateAnswer` 시그니처 확장 + 통합 sources**

`generateAnswer`를 다음으로 교체:

```ts
export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
): AsyncGenerator<SSEEvent> {
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  // Prebuild the unified sources array — text first, then graph.
  // Prompt index and UI index share the same order.
  const allTextSources: TextSourceRef[] = claims.map((c) => ({
    kind: 'text',
    pageId: c.pageId,
    title: c.pageTitle,
    url: c.pageUrl,
    excerpt: c.claimText.slice(0, 200),
    confidence: c.hybridScore,
  }));
  const allSources: SourceRef[] = [...allTextSources, ...graphSources];

  try {
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${context}\n\nQuestion: ${question}` }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
        yield { type: 'text', content: chunk.delta.text };
      }
      if (chunk.type === 'message_delta' && chunk.usage) {
        outputTokens = chunk.usage.output_tokens;
      }
      if (chunk.type === 'message_start' && chunk.message.usage) {
        inputTokens = chunk.message.usage.input_tokens;
      }
    }

    // Parse [source:N] citations from full text
    const citationPattern = /\[source:(\d+)\]/g;
    const citedIndexes = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(fullText)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      const idx = parseInt(raw, 10) - 1;
      if (idx >= 0 && idx < allSources.length) {
        citedIndexes.add(idx);
      }
    }

    // Emit only the cited sources, preserving original order
    const emitted: SourceRef[] = [];
    for (let i = 0; i < allSources.length; i++) {
      if (citedIndexes.has(i)) emitted.push(allSources[i]!);
    }

    yield { type: 'sources', sources: emitted };
    yield { type: 'done', totalTokens: inputTokens + outputTokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield { type: 'error', message };
  }
}
```

- [ ] **Step 5.3: `assembleContext` 확장 — 통합 인덱스 공간**

기존 `assembleContext`를 다음으로 교체. 프롬프트에서 text + graph를 같은 idx 공간으로 나열:

```ts
export function assembleContext(
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  graphCtx: GraphContext | null,
): string {
  const textEntries = claims.map(
    (c, i) =>
      `  <source idx="${i + 1}" kind="text" title="${escapeXml(c.pageTitle)}" url="${c.pageUrl}">${escapeXml(c.claimText)}</source>`,
  );

  const textCount = claims.length;
  const graphEntries = graphSources.map((g, i) => {
    const idx = textCount + i + 1;
    const conns = graphCtx?.matchedNodes.find((n) => n.nodeId === g.nodeId)?.connections ?? [];
    const connSummary = conns
      .slice(0, 5)
      .map((c) => `${c.relation} → ${escapeXml(c.targetLabel)}`)
      .join(', ');
    const pathLine = g.relationPath ? `Path: ${g.relationPath.map(escapeXml).join(' → ')}` : '';
    const communityLine = g.communityLabel ? `Community: ${escapeXml(g.communityLabel)}` : '';
    const fileLine = g.sourceFile ? `File: ${escapeXml(g.sourceFile)}` : '';
    const inner = [pathLine, communityLine, fileLine, connSummary ? `Connections: ${connSummary}` : '']
      .filter(Boolean)
      .join(' | ');
    return `  <source idx="${idx}" kind="graph" node="${escapeXml(g.nodeLabel)}">${inner}</source>`;
  });

  return `<context>\n${[...textEntries, ...graphEntries].join('\n')}\n</context>`;
}
```

- [ ] **Step 5.4: `askAI` 오케스트레이터 업데이트**

`askAI` 함수를 다음으로 교체:

```ts
export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions, snapshotId } = query;

  let claims: RetrievedClaim[];
  let graphCtx: GraphContext | null;

  try {
    [claims, graphCtx] = await Promise.all([
      retrieveRelevantClaims(question, workspaceId, userPermissions),
      retrieveRelevantGraphContext(question, workspaceId, {
        explicitSnapshotId: snapshotId,
      }).catch((err) => {
        console.error(
          '[ask] Graph context retrieval failed (degraded gracefully):',
          err instanceof Error ? err.message : err,
        );
        return null;
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retrieval failed';
    yield { type: 'error', message };
    return;
  }

  const graphSources: GraphSourceRef[] = graphCtx ? toGraphSourceRefs(graphCtx) : [];

  if (claims.length === 0 && graphSources.length === 0) {
    yield { type: 'text', content: '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.' };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    return;
  }

  const context = assembleContext(claims, graphSources, graphCtx);

  yield* generateAnswer(question, context, claims, graphSources);
}
```

**중요:** 기존 `formatGraphContextXml` 사용부가 제거되므로, 이 import도 없애거나 미사용 경고를 피할 수 있게 삭제한다. `graph-context.ts`에서 `formatGraphContextXml`이 다른 곳에서 쓰이지 않으면 export도 제거 가능하지만, 타 파일에서 임포트 중인지 먼저 확인:

```bash
grep -rn "formatGraphContextXml" packages apps
```

- [ ] **Step 5.5: SYSTEM_PROMPT 업데이트**

`SYSTEM_PROMPT` 상수를 graph/text 통합 인용 지시문으로 확장:

```ts
const SYSTEM_PROMPT = `You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided <context>. Do not use outside knowledge.

Sources inside <context> come in two kinds:
  - kind="text"  → excerpts from knowledge pages
  - kind="graph" → structural facts from the code/architecture graph (nodes, files, relations, paths)

For each factual claim, cite the source using [source:N] notation where N is the source idx.
If multiple sources support a claim, cite all: [source:1][source:3].
Use graph sources for structural questions ("how is X connected to Y", "what depends on X", "architecture of X").
Use text sources for definitions, policies, how-tos, and descriptive answers.
If <context> doesn't answer the question, say so explicitly and suggest the user search the knowledge base or contact the relevant team.
Keep answers concise and professional. Use the same language as the user's question.`;
```

- [ ] **Step 5.6: ask.test.ts 확장 — snapshotId 전달 검증**

기존 `packages/ai/ask.test.ts`에 `askAI`가 snapshotId를 graph-context로 정확히 전달하는지 확인하는 테스트 추가. 기존 파일 구조에 맞춰(mock 대상이 DB인지 `retrieveRelevantGraphContext`인지 파악 후) 추가. 최소 예시:

```ts
import { vi } from 'vitest';
import * as gcModule from '../graph-context';

describe('askAI — snapshot scoping', () => {
  it('passes explicit snapshotId into retrieveRelevantGraphContext', async () => {
    const spy = vi.spyOn(gcModule, 'retrieveRelevantGraphContext').mockResolvedValue(null);
    // ... (await for-of on askAI with AskQuery having snapshotId)
    // Consume iterator minimally
    const gen = askAI({
      question: 'q',
      workspaceId: 'ws-1',
      userId: 'u-1',
      userRoles: [],
      userPermissions: ['knowledge:read'],
      snapshotId: 'explicit-snap-1',
    });
    for await (const _ of gen) { /* drain */ }
    expect(spy).toHaveBeenCalledWith('q', 'ws-1', { explicitSnapshotId: 'explicit-snap-1' });
    spy.mockRestore();
  });
});
```

**주의:** `retrieveRelevantClaims`도 mock해야 실제 DB 호출이 없다. 기존 테스트의 mock 패턴을 따라 동일하게 처리.

- [ ] **Step 5.7: 테스트 실행**

```bash
pnpm --filter @jarvis/ai test
```

Expected: 기존 테스트 + 신규 테스트 모두 통과.

- [ ] **Step 5.8: Commit**

```bash
git add packages/ai/ask.ts packages/ai/ask.test.ts
git commit -m "feat(ai): unify text + graph sources in Ask pipeline with snapshot scoping"
```

---

## Task 6: Ask API route + useAskAI hook — snapshotId 지원

**Files:**
- Modify: `apps/web/app/api/ask/route.ts`
- Modify: `apps/web/lib/hooks/useAskAI.ts`

### Steps

- [ ] **Step 6.1: API route의 body schema 확장**

`apps/web/app/api/ask/route.ts:10-12`:

```ts
const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  snapshotId: z.string().uuid().optional(),
});
```

`askAI` 호출부(line 71~77)에 `snapshotId` 전달:

```ts
const generator = askAI({
  question: body.question,
  workspaceId: session.workspaceId,
  userId: session.userId,
  userRoles: session.roles ?? [],
  userPermissions: session.permissions ?? [],
  snapshotId: body.snapshotId,
});
```

- [ ] **Step 6.2: `useAskAI` hook 시그니처 확장**

`apps/web/lib/hooks/useAskAI.ts`:

interface 수정:
```ts
export interface UseAskAIReturn extends AskAIState {
  ask: (question: string, opts?: { snapshotId?: string }) => void;
  reset: () => void;
}
```

`ask` 함수 수정 (line 36 근처):
```ts
const ask = useCallback((question: string, opts?: { snapshotId?: string }) => {
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  setState({
    isStreaming: true,
    answer: "",
    sources: [],
    error: null,
    question,
  });

  (async () => {
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, snapshotId: opts?.snapshotId }),
        signal: controller.signal,
      });
      // ... (기존 response 처리 그대로 유지)
```

- [ ] **Step 6.3: 타입체크**

```bash
pnpm --filter @jarvis/web type-check
```

Expected: clean. 기존 `ask(question)` 호출부는 optional 파라미터라 영향 없음.

- [ ] **Step 6.4: Commit**

```bash
git add apps/web/app/api/ask/route.ts apps/web/lib/hooks/useAskAI.ts
git commit -m "feat(ask): accept explicit snapshotId in Ask API body + hook"
```

---

## Task 7: import-knowledge — upsert 로직

**Files:**
- Modify: `apps/worker/src/helpers/import-knowledge.ts`
- Modify (or Create): `apps/worker/__tests__/helpers/import-knowledge.test.ts`

### Steps

- [ ] **Step 7.1: 기존 테스트 파일 존재 확인**

```bash
ls apps/worker/__tests__/helpers/ 2>/dev/null || echo "no helpers test dir"
find apps/worker -name "*.test.ts"
```

기존 테스트가 없으면 신규, 있으면 확장.

- [ ] **Step 7.2: `import-knowledge.ts` 전면 리팩토링**

```ts
// apps/worker/src/helpers/import-knowledge.ts

import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import {
  knowledgePage,
  knowledgePageVersion,
} from '@jarvis/db/schema/knowledge';
import { sql, eq, and, desc } from 'drizzle-orm';
import { boss } from '../lib/boss.js';

export interface ImportKnowledgeParams {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;
  sensitivity: string;
  createdBy: string | null;
  sourceType: string;
  sourceKey: string;
}

export interface ImportKnowledgeResult {
  pageId: string;
  wasCreated: boolean;
  wasUpdated: boolean;
  versionNumber: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function importAsKnowledgePage(
  params: ImportKnowledgeParams,
): Promise<ImportKnowledgeResult> {
  const result = await db.transaction(async (tx) => {
    // 1. Look up by external key with row lock
    const existingRows = await tx.execute<{
      id: string;
      title: string;
    }>(sql`
      SELECT id, title FROM knowledge_page
      WHERE workspace_id = ${params.workspaceId}::uuid
        AND source_type = ${params.sourceType}
        AND source_key  = ${params.sourceKey}
      FOR UPDATE
      LIMIT 1
    `);
    const existing = existingRows.rows[0];

    if (existing) {
      // 2. Fetch latest version's mdxContent
      const [latestVer] = await tx
        .select({
          versionNumber: knowledgePageVersion.versionNumber,
          mdxContent: knowledgePageVersion.mdxContent,
        })
        .from(knowledgePageVersion)
        .where(eq(knowledgePageVersion.pageId, existing.id))
        .orderBy(desc(knowledgePageVersion.versionNumber))
        .limit(1);

      if (latestVer && latestVer.mdxContent === params.mdxContent) {
        // Content unchanged — no-op (also skip title bump to avoid needless updatedAt churn)
        return {
          pageId: existing.id,
          wasCreated: false,
          wasUpdated: false,
          versionNumber: latestVer.versionNumber,
        };
      }

      const nextVersion = (latestVer?.versionNumber ?? 0) + 1;

      await tx.insert(knowledgePageVersion).values({
        id: randomUUID(),
        pageId: existing.id,
        versionNumber: nextVersion,
        title: params.title,
        mdxContent: params.mdxContent,
        changeNote: 'Auto-reimported from Graphify (rebuild)',
        authorId: params.createdBy,
      });

      await tx
        .update(knowledgePage)
        .set({ title: params.title, updatedAt: new Date() })
        .where(eq(knowledgePage.id, existing.id));

      return {
        pageId: existing.id,
        wasCreated: false,
        wasUpdated: true,
        versionNumber: nextVersion,
      };
    }

    // 3. Insert path — slug collision check (across all sources in workspace)
    let resolvedSlug = params.slug;
    const existingSlugs = await tx
      .select({ slug: knowledgePage.slug })
      .from(knowledgePage)
      .where(
        and(
          eq(knowledgePage.workspaceId, params.workspaceId),
          sql`${knowledgePage.slug} LIKE ${params.slug + '%'}`,
        ),
      );
    if (existingSlugs.some((r) => r.slug === resolvedSlug)) {
      const maxSuffix = existingSlugs.reduce((max, r) => {
        const m = r.slug.match(new RegExp(`^${escapeRegex(params.slug)}-(\\d+)$`));
        return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
      }, 0);
      resolvedSlug = `${params.slug}-${maxSuffix + 1}`;
    }

    const pageId = randomUUID();
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: resolvedSlug,
      sensitivity: params.sensitivity,
      publishStatus: 'published',
      sourceType: params.sourceType,
      sourceKey: params.sourceKey,
      createdBy: params.createdBy,
    });

    await tx.insert(knowledgePageVersion).values({
      id: randomUUID(),
      pageId,
      versionNumber: 1,
      title: params.title,
      mdxContent: params.mdxContent,
      changeNote: 'Auto-imported from Graphify',
      authorId: params.createdBy,
    });

    return {
      pageId,
      wasCreated: true,
      wasUpdated: true,
      versionNumber: 1,
    };
  });

  // Enqueue compile only if content actually changed
  if (result.wasCreated || result.wasUpdated) {
    await boss.send('compile', { pageId: result.pageId });
    console.log(
      `[import-knowledge] sourceKey=${params.sourceKey} pageId=${result.pageId} wasCreated=${result.wasCreated} wasUpdated=${result.wasUpdated} v${result.versionNumber} → compile enqueued`,
    );
  } else {
    console.log(
      `[import-knowledge] sourceKey=${params.sourceKey} pageId=${result.pageId} unchanged (v${result.versionNumber}), skipping compile`,
    );
  }

  return result;
}

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  return slug || 'page';
}
```

- [ ] **Step 7.3: 테스트 작성**

`apps/worker/__tests__/helpers/import-knowledge.test.ts` (없으면 신규):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { sql, eq, desc } from 'drizzle-orm';
import { importAsKnowledgePage } from '../../src/helpers/import-knowledge';
import { boss } from '../../src/lib/boss';

async function seedWs(): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO workspace (id, name, slug)
    VALUES (${id}, 'ik-test', ${'ik-' + id.slice(0,8)})
    ON CONFLICT DO NOTHING
  `);
  return id;
}

describe('importAsKnowledgePage — upsert', () => {
  let wsId: string;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    wsId = await seedWs();
    sendSpy = vi.spyOn(boss, 'send').mockResolvedValue('' as any);
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM knowledge_page WHERE workspace_id = ${wsId}`);
    await db.execute(sql`DELETE FROM workspace WHERE id = ${wsId}`);
    sendSpy.mockRestore();
  });

  const baseParams = (overrides: Partial<Parameters<typeof importAsKnowledgePage>[0]> = {}) => ({
    workspaceId: wsId,
    title: 'Graph Report',
    slug: 'graph-report',
    mdxContent: '# hello',
    pageType: 'analysis',
    sensitivity: 'INTERNAL',
    createdBy: null,
    sourceType: 'graphify',
    sourceKey: 'attachment:a:GRAPH_REPORT.md',
    ...overrides,
  });

  it('creates a new page and version on first import', async () => {
    const r = await importAsKnowledgePage(baseParams());
    expect(r.wasCreated).toBe(true);
    expect(r.wasUpdated).toBe(true);
    expect(r.versionNumber).toBe(1);
    expect(sendSpy).toHaveBeenCalledWith('compile', { pageId: r.pageId });
  });

  it('creates a new version on rebuild with changed content', async () => {
    const first = await importAsKnowledgePage(baseParams({ mdxContent: 'v1' }));
    sendSpy.mockClear();
    const second = await importAsKnowledgePage(baseParams({ mdxContent: 'v2' }));
    expect(second.pageId).toBe(first.pageId);
    expect(second.wasCreated).toBe(false);
    expect(second.wasUpdated).toBe(true);
    expect(second.versionNumber).toBe(2);
    expect(sendSpy).toHaveBeenCalledWith('compile', { pageId: first.pageId });
  });

  it('skips compile on rebuild with identical content', async () => {
    const first = await importAsKnowledgePage(baseParams({ mdxContent: 'same' }));
    sendSpy.mockClear();
    const second = await importAsKnowledgePage(baseParams({ mdxContent: 'same' }));
    expect(second.pageId).toBe(first.pageId);
    expect(second.wasCreated).toBe(false);
    expect(second.wasUpdated).toBe(false);
    expect(second.versionNumber).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('preserves user-set publishStatus across rebuilds', async () => {
    const { pageId } = await importAsKnowledgePage(baseParams({ mdxContent: 'original' }));
    // Simulate user unpublishing
    await db.update(knowledgePage).set({ publishStatus: 'draft' }).where(eq(knowledgePage.id, pageId));

    // Rebuild with new content
    await importAsKnowledgePage(baseParams({ mdxContent: 'updated' }));

    const [page] = await db.select({ publishStatus: knowledgePage.publishStatus })
      .from(knowledgePage)
      .where(eq(knowledgePage.id, pageId));
    expect(page?.publishStatus).toBe('draft');
  });

  it('different sourceKey creates different pages', async () => {
    const r1 = await importAsKnowledgePage(baseParams({ sourceKey: 'attachment:a:file1.md', slug: 'f1' }));
    const r2 = await importAsKnowledgePage(baseParams({ sourceKey: 'attachment:a:file2.md', slug: 'f2' }));
    expect(r1.pageId).not.toBe(r2.pageId);
  });
});
```

- [ ] **Step 7.4: 테스트 실행**

```bash
pnpm --filter @jarvis/worker test -- import-knowledge
```

Expected: 5 tests passed.

- [ ] **Step 7.5: Commit**

```bash
git add apps/worker/src/helpers/import-knowledge.ts apps/worker/__tests__/helpers/import-knowledge.test.ts
git commit -m "feat(worker): convert importAsKnowledgePage to upsert by external key"
```

---

## Task 8: graphify-build — sourceType/sourceKey 계산 및 전달

**Files:**
- Modify: `apps/worker/src/jobs/graphify-build.ts`

### Steps

- [ ] **Step 8.1: snapshot 생성 시 scope 정보 저장**

기존 line 67~76의 `db.insert(graphSnapshot)`을 다음으로 교체. archive 업로드 기반이므로 `scopeType='attachment'`, `scopeId=rawSourceId`:

```ts
await db.insert(graphSnapshot).values({
  id: snapshotId,
  workspaceId,
  rawSourceId,
  scopeType: 'attachment',
  scopeId: rawSourceId,
  title: 'Building...',
  buildMode: mode ?? 'standard',
  buildStatus: 'running',
  createdBy: requestedBy,
  updatedAt: new Date(),
});
```

- [ ] **Step 8.2: GRAPH_REPORT.md import 시 sourceKey 전달**

기존 line 192~200 `importAsKnowledgePage({...})` 호출을 다음으로 교체:

```ts
await importAsKnowledgePage({
  workspaceId,
  title: reportTitle,
  slug: slugify(`graph-report-${rawSourceId.slice(0, 8)}`),
  mdxContent: reportContent,
  pageType: 'analysis',
  sensitivity: 'INTERNAL',
  createdBy: requestedBy,
  sourceType: 'graphify',
  sourceKey: `attachment:${rawSourceId}:GRAPH_REPORT.md`,
});
```

**주의:** slug가 `snapshotId.slice(0, 8)` 대신 `rawSourceId.slice(0, 8)`로 바뀐 것 — 재빌드 시 slug가 안정적이어야 upsert 경로가 자연스러움. 초기 INSERT 1회는 slug가 이 형태로 고정된 뒤 이후 rebuild는 slug를 건드리지 않음.

- [ ] **Step 8.3: wiki/*.md import 시 sourceKey 전달**

기존 line 219~227 블록을 다음으로 교체:

```ts
for (const wikiFile of mdFiles) {
  const content = await readFile(join(wikiDir, wikiFile), 'utf-8');
  const title = wikiFile.replace(/\.md$/, '').replace(/_/g, ' ');
  const artifactPath = `wiki/${wikiFile}`;

  await importAsKnowledgePage({
    workspaceId,
    title: `[Graph] ${title}`,
    slug: slugify(`graph-wiki-${rawSourceId.slice(0, 8)}-${title}`),
    mdxContent: content,
    pageType: 'analysis',
    sensitivity: 'INTERNAL',
    createdBy: requestedBy,
    sourceType: 'graphify',
    sourceKey: `attachment:${rawSourceId}:${artifactPath}`,
  });
}
```

- [ ] **Step 8.4: 타입체크**

```bash
pnpm --filter @jarvis/worker type-check
```

Expected: clean.

- [ ] **Step 8.5: Commit**

```bash
git add apps/worker/src/jobs/graphify-build.ts
git commit -m "feat(worker): persist scope metadata + pass sourceKey to import-knowledge"
```

---

## Task 9: AskPage — searchParams 읽기 + initialScope 전달

**Files:**
- Modify: `apps/web/app/(app)/ask/page.tsx`

### Steps

- [ ] **Step 9.1: 현재 AskPage 파일 전문 다시 확인**

```bash
cat apps/web/app/\(app\)/ask/page.tsx
```

목적: import 스타일, session 가져오기 방식 파악.

- [ ] **Step 9.2: `ask/page.tsx` 전면 교체**

```tsx
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { searchLog } from "@jarvis/db/schema";
import { graphSnapshot } from "@jarvis/db/schema/graph";
import { AskPanel } from "@/components/ai/AskPanel";

interface Props {
  searchParams: Promise<{ q?: string; snapshot?: string }>;
}

async function getPopularQuestions(workspaceId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ query: searchLog.query, cnt: count(searchLog.id) })
      .from(searchLog)
      .where(sql`workspace_id = ${workspaceId}::uuid AND query IS NOT NULL AND length(query) > 5`)
      .groupBy(searchLog.query)
      .orderBy(desc(count(searchLog.id)))
      .limit(5);
    return rows.map((row) => row.query).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export default async function AskPage({ searchParams }: Props) {
  const t = await getTranslations("Ask");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;

  if (!session) {
    redirect("/login");
  }

  const { q, snapshot: snapshotIdParam } = await searchParams;
  const popularQuestions = await getPopularQuestions(session.workspaceId);

  let initialScope: { id: string; title: string } | null = null;
  if (snapshotIdParam) {
    try {
      const [row] = await db
        .select({ id: graphSnapshot.id, title: graphSnapshot.title })
        .from(graphSnapshot)
        .where(and(
          eq(graphSnapshot.id, snapshotIdParam),
          eq(graphSnapshot.workspaceId, session.workspaceId),
        ))
        .limit(1);
      if (row) initialScope = row;
    } catch {
      // invalid uuid or DB issue → fall through with null
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">
            지식 베이스 기반 AI 답변, 출처 인용, 실시간 스트리밍
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <AskPanel
          initialQuestion={q ?? ""}
          initialScope={initialScope}
          popularQuestions={popularQuestions}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 9.3: 타입체크 (AskPanel prop 추가 전이므로 일시적 에러 예상)**

```bash
pnpm --filter @jarvis/web type-check 2>&1 | grep AskPanel
```

Expected: `initialScope` prop 없음 에러 — Task 10에서 해소.

- [ ] **Step 9.4: Commit (type error 포함 — 다음 task에서 해소)**

Task 9와 Task 10을 연속 작업으로 보고 atomic하게 커밋 원하면 Task 10 끝나고 한 번에 커밋. 그렇지 않다면 임시로 `// @ts-expect-error — resolved in Task 10`으로 억제 후 커밋 가능. 이 plan에서는 한 번에 커밋(Task 10 끝에서) 권장.

---

## Task 10: AskPanel — initialScope prop + Badge UI

**Files:**
- Modify: `apps/web/components/ai/AskPanel.tsx`

### Steps

- [ ] **Step 10.1: AskPanelProps 확장**

`apps/web/components/ai/AskPanel.tsx` 맨 위 interface를:

```ts
interface AskPanelProps {
  initialQuestion?: string;
  initialScope?: { id: string; title: string } | null;
  popularQuestions?: string[];
}
```

- [ ] **Step 10.2: state + handleAsk에 snapshotId 전달**

`AskPanel` 함수 본문에서 `const [input, setInput] = useState(initialQuestion);` 아래 추가:

```ts
const [activeScope, setActiveScope] = useState<{ id: string; title: string } | null>(
  initialScope ?? null,
);
```

`handleAsk` 함수 내부의 `ask(rawQuestion)` 호출을:

```ts
ask(rawQuestion, { snapshotId: activeScope?.id });
```

- [ ] **Step 10.3: Badge UI 추가**

입력창(textarea)이 있는 영역의 직전(또는 위) 지점에 Badge 컴포넌트를 끼워넣는다. 기존 파일의 JSX 구조를 보존하면서, 입력 영역 위에 다음을 삽입:

```tsx
{activeScope && (
  <div className="flex items-center gap-2">
    <Badge variant="outline" className="gap-1">
      <BotMessageSquare className="h-3 w-3" />
      <span className="text-xs">
        {t("graphScope", { title: activeScope.title })}
      </span>
      <button
        type="button"
        onClick={() => setActiveScope(null)}
        aria-label={t("clearScope")}
        className="ml-1 rounded-sm hover:bg-muted"
      >
        ✕
      </button>
    </Badge>
  </div>
)}
```

주의: `useTranslations`가 이미 있으면 그 `t`를 쓰고, 없으면 import 추가. 현재 파일은 `next-intl` 사용 여부 미확인 — `getTranslations`가 아니라 client side `useTranslations("Ask")`.

import 추가가 필요하면:
```ts
import { useTranslations } from "next-intl";
```

그리고 `AskPanel` 최상단에:
```ts
const t = useTranslations("Ask");
```

(기존에 `t`가 있으면 그대로 쓰면 됨)

- [ ] **Step 10.4: 기존 useEffect에서 initialScope 변경 대응 (optional)**

```ts
useEffect(() => {
  if (initialQuestion && initialQuestion.trim()) {
    setInput(initialQuestion);
    handleAsk(initialQuestion);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [initialQuestion]);
```

**주의:** `handleAsk`가 `activeScope`를 참조하므로, `initialScope`가 바뀌면 state가 업데이트되지만 `handleAsk`의 클로저는 당장 반영 안 될 수도 있음. 보수적으로:

```ts
useEffect(() => {
  setActiveScope(initialScope ?? null);
}, [initialScope]);
```

를 따로 추가.

- [ ] **Step 10.5: 타입체크 + Task 9 에러 해소 확인**

```bash
pnpm --filter @jarvis/web type-check
```

Expected: clean.

- [ ] **Step 10.6: Commit (Task 9 + 10 atomic)**

```bash
git add apps/web/app/\(app\)/ask/page.tsx apps/web/components/ai/AskPanel.tsx
git commit -m "feat(ask): wire /ask?q= and ?snapshot= URL params through AskPanel"
```

---

## Task 11: SourceRefCard + ClaimBadge — graph variant 렌더

**Files:**
- Modify: `apps/web/components/ai/SourceRefCard.tsx`
- Modify: `apps/web/components/ai/ClaimBadge.tsx`
- Create: `apps/web/components/ai/__tests__/SourceRefCard.test.tsx`

### Steps

- [ ] **Step 11.1: 현재 `SourceRefCard.tsx` 구조 확인**

```bash
cat apps/web/components/ai/SourceRefCard.tsx
```

기존 카드 레이아웃을 모방하여 graph variant를 만든다.

- [ ] **Step 11.2: `SourceRefCard.tsx`를 variant switch로 리팩토링**

기존 파일의 export 함수 시그니처를 유지하되 kind에 따라 분기:

```tsx
import Link from "next/link";
import { Network, FileText } from "lucide-react";
import type { SourceRef, TextSourceRef, GraphSourceRef } from "@jarvis/ai/types";

interface SourceRefCardProps {
  source: SourceRef;
  index: number;
}

export function SourceRefCard({ source, index }: SourceRefCardProps) {
  if (source.kind === 'graph') {
    return <GraphSourceCard source={source} index={index} />;
  }
  return <TextSourceCard source={source} index={index} />;
}

function TextSourceCard({ source, index }: { source: TextSourceRef; index: number }) {
  // Keep existing text rendering — copy body from previous SourceRefCard
  return (
    <Link
      href={source.url}
      className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <h4 className="truncate text-sm font-medium">{source.title}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {source.excerpt}
          </p>
        </div>
      </div>
    </Link>
  );
}

function GraphSourceCard({ source, index }: { source: GraphSourceRef; index: number }) {
  return (
    <Link
      href={source.url}
      className="block rounded-lg border border-blue-200 bg-blue-50/30 p-3 hover:bg-blue-50 transition-colors dark:border-blue-900 dark:bg-blue-950/20"
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 px-1.5 text-xs font-medium text-blue-900 dark:bg-blue-900 dark:text-blue-100">
          G{index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Network className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <h4 className="truncate text-sm font-medium">{source.nodeLabel}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {source.sourceFile && <span>{source.sourceFile}</span>}
            {source.sourceFile && source.communityLabel && <span> · </span>}
            {source.communityLabel && <span>Community: {source.communityLabel}</span>}
          </p>
          {source.relationPath && source.relationPath.length > 0 && (
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300 line-clamp-1">
              {source.relationPath.join(' → ')}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Graph: {source.snapshotTitle}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

**주의:** 기존 TextSourceCard의 정확한 마크업이 다를 수 있으니, `cat apps/web/components/ai/SourceRefCard.tsx`로 확인 후 그대로 옮겨오기.

- [ ] **Step 11.3: `ClaimBadge.tsx` 수정 — graph variant 라벨**

```bash
cat apps/web/components/ai/ClaimBadge.tsx
```

`sources[sourceNumber - 1]`로 source를 찾는 부분에서:

```tsx
const source = sources[sourceNumber - 1];
if (!source) return null;

const label = source.kind === 'graph' ? `G${sourceNumber}` : `${sourceNumber}`;
const hoverText = source.kind === 'graph'
  ? `Graph: ${source.nodeLabel}`
  : source.title;
// ... 이 label과 hoverText를 기존 render에 반영
```

구체 적용은 기존 ClaimBadge 구조에 맞춰 최소 수정.

- [ ] **Step 11.4: SourceRefCard 컴포넌트 테스트 작성**

`apps/web/components/ai/__tests__/SourceRefCard.test.tsx` 신규:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceRefCard } from '../SourceRefCard';
import type { TextSourceRef, GraphSourceRef } from '@jarvis/ai/types';

describe('SourceRefCard', () => {
  it('renders text variant with title and excerpt', () => {
    const source: TextSourceRef = {
      kind: 'text',
      pageId: 'p1',
      title: 'Policy Doc',
      url: '/knowledge/p1',
      excerpt: 'This is a test excerpt.',
      confidence: 0.9,
    };
    render(<SourceRefCard source={source} index={1} />);
    expect(screen.getByText('Policy Doc')).toBeInTheDocument();
    expect(screen.getByText(/test excerpt/)).toBeInTheDocument();
  });

  it('renders graph variant with nodeLabel and community', () => {
    const source: GraphSourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'Repo A',
      nodeId: 'n1',
      nodeLabel: 'UserService',
      sourceFile: 'services/user.ts',
      communityLabel: 'Auth',
      url: '/architecture?snapshot=s1&node=n1',
      confidence: 0.7,
    };
    render(<SourceRefCard source={source} index={2} />);
    expect(screen.getByText('UserService')).toBeInTheDocument();
    expect(screen.getByText(/services\/user\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/Community: Auth/)).toBeInTheDocument();
    expect(screen.getByText(/Repo A/)).toBeInTheDocument();
  });

  it('renders relationPath chain when provided', () => {
    const source: GraphSourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'Repo A',
      nodeId: 'a->c',
      nodeLabel: 'A → C',
      sourceFile: null,
      communityLabel: null,
      relationPath: ['A', 'B', 'C'],
      url: '/architecture?snapshot=s1',
      confidence: 0.7,
    };
    render(<SourceRefCard source={source} index={3} />);
    expect(screen.getByText('A → B → C')).toBeInTheDocument();
  });
});
```

**주의:** `@testing-library/react`가 프로젝트 dev deps에 있어야 한다. 없으면 `pnpm add -D @testing-library/react @testing-library/jest-dom jsdom --filter @jarvis/web` — 하지만 먼저 기존에 있는지 확인:

```bash
grep -l "@testing-library/react" apps/web/package.json apps/web/vitest.config*.ts 2>/dev/null
```

없으면 이 테스트는 스킵하고 `describe.skip` 처리 후 Task 17의 E2E에서 대체 검증.

- [ ] **Step 11.5: 테스트 실행**

```bash
pnpm --filter @jarvis/web test -- SourceRefCard
pnpm --filter @jarvis/web type-check
```

Expected: 3 tests passed (또는 skip), type-check clean.

- [ ] **Step 11.6: Commit**

```bash
git add apps/web/components/ai/SourceRefCard.tsx apps/web/components/ai/ClaimBadge.tsx apps/web/components/ai/__tests__/SourceRefCard.test.tsx
git commit -m "feat(ask-ui): render graph source variant in SourceRefCard + ClaimBadge"
```

---

## Task 12: BuildLifecycleSection (신규 서버 컴포넌트)

**Files:**
- Create: `apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx`

### Steps

- [ ] **Step 12.1: 신규 파일 작성**

```tsx
// apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { and, desc, eq, count, sql } from "drizzle-orm";
import { Loader2, Clock, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { db } from "@jarvis/db/client";
import { graphSnapshot } from "@jarvis/db/schema/graph";

interface Props {
  workspaceId: string;
}

type BuildStatus = 'pending' | 'running' | 'done' | 'error';

export async function BuildLifecycleSection({ workspaceId }: Props) {
  const t = await getTranslations("Architecture.BuildLifecycle");

  const countRows = await db
    .select({ status: graphSnapshot.buildStatus, cnt: count() })
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, workspaceId))
    .groupBy(graphSnapshot.buildStatus);

  const byStatus: Record<BuildStatus, number> = {
    pending: 0, running: 0, done: 0, error: 0,
  };
  for (const row of countRows) {
    byStatus[row.status as BuildStatus] = Number(row.cnt);
  }

  const recentActive = await db
    .select({
      id: graphSnapshot.id,
      title: graphSnapshot.title,
      status: graphSnapshot.buildStatus,
      createdAt: graphSnapshot.createdAt,
    })
    .from(graphSnapshot)
    .where(and(
      eq(graphSnapshot.workspaceId, workspaceId),
      sql`${graphSnapshot.buildStatus} IN ('pending','running','error')`,
    ))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(10);

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">{t("title")}</h2>
        <div className="flex gap-3 text-sm">
          <StatusChip kind="running" count={byStatus.running} label={t("status.running")} />
          <StatusChip kind="pending" count={byStatus.pending} label={t("status.pending")} />
          <StatusChip kind="error"   count={byStatus.error}   label={t("status.error")} />
          <StatusChip kind="done"    count={byStatus.done}    label={t("status.done")} />
        </div>
      </header>

      {recentActive.length > 0 && (
        <ul className="text-sm divide-y">
          {recentActive.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-2">
              <Link
                href={`/architecture?snapshot=${s.id}`}
                className="flex items-center gap-2 min-w-0 hover:underline"
              >
                <StatusIcon kind={s.status as BuildStatus} className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.title}</span>
              </Link>
              <span className="text-xs text-muted-foreground shrink-0">
                {s.createdAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusChip({
  kind,
  count,
  label,
}: { kind: BuildStatus; count: number; label: string }) {
  const color = {
    running: "text-blue-600",
    pending: "text-gray-500",
    error:   "text-red-600",
    done:    "text-green-600",
  }[kind];
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <StatusIcon kind={kind} className="h-3 w-3" />
      <span className="text-xs">{label}</span>
      <span className="text-xs font-semibold">{count}</span>
    </span>
  );
}

function StatusIcon({ kind, className }: { kind: BuildStatus; className?: string }) {
  if (kind === "running") return <Loader2 className={`${className} animate-spin text-blue-600`} />;
  if (kind === "pending") return <Circle className={`${className} text-gray-500`} />;
  if (kind === "error")   return <AlertTriangle className={`${className} text-red-600`} />;
  return <CheckCircle2 className={`${className} text-green-600`} />;
}
```

- [ ] **Step 12.2: 타입체크**

```bash
pnpm --filter @jarvis/web type-check
```

Expected: clean (Architecture.BuildLifecycle i18n 키는 Task 16에서 추가, 미리 선언 안 하면 next-intl이 warn만 낼 수 있음).

- [ ] **Step 12.3: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/BuildLifecycleSection.tsx
git commit -m "feat(architecture): add BuildLifecycleSection server component"
```

---

## Task 13: BuildStatusCard (신규 컴포넌트)

**Files:**
- Create: `apps/web/app/(app)/architecture/components/BuildStatusCard.tsx`

### Steps

- [ ] **Step 13.1: 신규 파일 작성**

```tsx
// apps/web/app/(app)/architecture/components/BuildStatusCard.tsx

import { getTranslations } from "next-intl/server";
import { Loader2, Clock, AlertTriangle } from "lucide-react";

interface Props {
  kind: "running" | "pending" | "error";
  title: string;
  startedAt: Date;
  error?: string | null;
}

export async function BuildStatusCard({ kind, title, startedAt, error }: Props) {
  const t = await getTranslations("Architecture.BuildStatus");
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

  if (kind === "running") {
    return (
      <div className="border rounded-lg p-6 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="font-medium">{t("running", { title })}</p>
            <p className="text-xs text-muted-foreground">
              {t("elapsed", { seconds: elapsedSec })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "pending") {
    return (
      <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900/20">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-gray-500" />
          <p className="font-medium">{t("pending", { title })}</p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="border rounded-lg p-6 bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900 space-y-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <p className="font-medium">{t("error", { title })}</p>
      </div>
      {error && (
        <pre className="text-xs bg-red-100/60 dark:bg-red-950/40 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">
          {error}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 13.2: 타입체크**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 13.3: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/BuildStatusCard.tsx
git commit -m "feat(architecture): add BuildStatusCard for running/pending/error states"
```

---

## Task 14: SnapshotSelector — 모든 상태 + 아이콘

**Files:**
- Modify: `apps/web/app/(app)/architecture/components/SnapshotSelector.tsx`

### Steps

- [ ] **Step 14.1: 현재 파일 확인**

```bash
cat apps/web/app/\(app\)/architecture/components/SnapshotSelector.tsx
```

- [ ] **Step 14.2: Props에 buildStatus 추가 + render 수정**

기존 `SerializedSnapshot` 타입(또는 prop 인터페이스)에 `buildStatus` 추가:

```ts
interface SerializedSnapshot {
  id: string;
  title: string;
  createdAt: string;
  buildMode: string;
  buildStatus: 'pending' | 'running' | 'done' | 'error';   // NEW
}
```

각 option 렌더에 상태 아이콘 추가. 현재 구현이 native `<select>`인지 Radix Select인지에 따라 방식이 다름:

**native select 이면:**
```tsx
<option key={s.id} value={s.id}>
  {statusEmoji(s.buildStatus)} {s.title}
</option>

function statusEmoji(status: string): string {
  switch (status) {
    case 'done':    return '✓';
    case 'running': return '⟳';
    case 'pending': return '◦';
    case 'error':   return '✕';
    default:        return '•';
  }
}
```

**Radix Select 이면:** 각 `SelectItem`에 `<StatusIcon />` + title 조합.

- [ ] **Step 14.3: 타입체크**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 14.4: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/SnapshotSelector.tsx
git commit -m "feat(architecture): show all build statuses in SnapshotSelector"
```

---

## Task 15: Architecture page — 모든 상태 fetch + 분기 렌더

**Files:**
- Modify: `apps/web/app/(app)/architecture/page.tsx`

### Steps

- [ ] **Step 15.1: 페이지 전면 교체**

```tsx
// apps/web/app/(app)/architecture/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc } from 'drizzle-orm';
import { GraphViewer } from './components/GraphViewer';
import { SnapshotSelector } from './components/SnapshotSelector';
import { GodNodesCard } from './components/GodNodesCard';
import { SuggestedQuestions } from './components/SuggestedQuestions';
import { BuildLifecycleSection } from './components/BuildLifecycleSection';
import { BuildStatusCard } from './components/BuildStatusCard';

interface Props {
  searchParams: Promise<{ snapshot?: string }>;
}

export default async function ArchitecturePage({ searchParams }: Props) {
  const t = await getTranslations('Architecture');
  const session = await requirePageSession();
  const workspaceId = session.workspaceId;
  const { snapshot: selectedId } = await searchParams;

  // Fetch all snapshots regardless of status (limit 20 recent)
  const snapshots = await db
    .select()
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, workspaceId))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(20);

  // Selection priority: explicit id → latest done → latest any
  const current =
    (selectedId && snapshots.find((s) => s.id === selectedId)) ??
    snapshots.find((s) => s.buildStatus === 'done') ??
    snapshots[0];

  const serializedSnapshots = snapshots.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    buildMode: s.buildMode,
    buildStatus: s.buildStatus,
  }));

  const metadata = (current?.analysisMetadata ?? {}) as {
    godNodes?: string[];
    suggestedQuestions?: string[];
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {snapshots.length > 0 && (
          <SnapshotSelector snapshots={serializedSnapshots} currentId={current?.id ?? ''} />
        )}
      </div>

      <BuildLifecycleSection workspaceId={workspaceId} />

      {!current && (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          아직 Graphify 분석 결과가 없습니다. ZIP 파일을 업로드하거나 수동으로 빌드를 트리거하세요.
        </div>
      )}

      {current?.buildStatus === 'done' && current.graphHtmlPath && (
        <>
          <GraphViewer snapshotId={current.id} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <GodNodesCard
              godNodes={metadata.godNodes ?? []}
              nodeCount={current.nodeCount ?? 0}
              edgeCount={current.edgeCount ?? 0}
              communityCount={current.communityCount ?? 0}
            />

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">{t('buildInfo')}</h3>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('mode')}</dt>
                  <dd>{current.buildMode}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('duration')}</dt>
                  <dd>
                    {current.buildDurationMs
                      ? `${(current.buildDurationMs / 1000).toFixed(1)}s`
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('files')}</dt>
                  <dd>{current.fileCount ?? '-'}</dd>
                </div>
              </dl>
            </div>

            <SuggestedQuestions questions={metadata.suggestedQuestions ?? []} />
          </div>
        </>
      )}

      {current?.buildStatus === 'done' && !current.graphHtmlPath && (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          시각화 파일이 없습니다 (--no-viz 모드로 빌드됨)
        </div>
      )}

      {current?.buildStatus === 'running' && (
        <BuildStatusCard
          kind="running"
          title={current.title}
          startedAt={current.createdAt}
        />
      )}

      {current?.buildStatus === 'pending' && (
        <BuildStatusCard
          kind="pending"
          title={current.title}
          startedAt={current.createdAt}
        />
      )}

      {current?.buildStatus === 'error' && (
        <BuildStatusCard
          kind="error"
          title={current.title}
          startedAt={current.createdAt}
          error={current.buildError}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 15.2: 타입체크**

```bash
pnpm --filter @jarvis/web type-check
```

Expected: 단 i18n 키 누락 경고(Task 16에서 해소). 타입은 clean.

- [ ] **Step 15.3: 수정된 `SuggestedQuestions`에 snapshotId 파라미터 전달 (선택)**

현재 `SuggestedQuestions.tsx:26`은 `/ask?q=${q}` 로만 이동. snapshot scope까지 전달하려면:

```tsx
// current snapshot id를 prop으로 받아서 전달
interface Props { questions: string[]; snapshotId?: string }
// ...
onClick={() => {
  const url = snapshotId
    ? `/ask?q=${encodeURIComponent(q)}&snapshot=${snapshotId}`
    : `/ask?q=${encodeURIComponent(q)}`;
  router.push(url);
}}
```

그리고 page.tsx의 `<SuggestedQuestions questions={...} />`에 `snapshotId={current.id}` 추가.

- [ ] **Step 15.4: Commit**

```bash
git add apps/web/app/\(app\)/architecture/page.tsx apps/web/app/\(app\)/architecture/components/SuggestedQuestions.tsx
git commit -m "feat(architecture): branch render by build status + wire snapshot scope into suggested questions"
```

---

## Task 16: i18n 키 추가 (ko.json)

**Files:**
- Modify: `apps/web/messages/ko.json`

### Steps

- [ ] **Step 16.1: 기존 구조 파악**

```bash
grep -n '"Architecture"\|"Ask"' apps/web/messages/ko.json | head -20
```

`Architecture`와 `Ask` 섹션 위치 확인.

- [ ] **Step 16.2: `Architecture` 섹션에 `BuildLifecycle` + `BuildStatus` 추가**

기존 `Architecture` JSON 객체 안에 (또는 새로 생성):

```json
"BuildLifecycle": {
  "title": "빌드 상태",
  "status": {
    "running": "진행 중",
    "pending": "대기 중",
    "error": "실패",
    "done": "완료"
  }
},
"BuildStatus": {
  "running": "'{title}' 빌드가 진행 중입니다.",
  "pending": "'{title}' 빌드가 큐에 있습니다.",
  "error": "'{title}' 빌드가 실패했습니다.",
  "elapsed": "경과: {seconds}초"
}
```

- [ ] **Step 16.3: `Ask` 섹션에 scope 관련 키 추가**

```json
"graphScope": "Graph 컨텍스트: {title}",
"clearScope": "Graph 컨텍스트 해제"
```

- [ ] **Step 16.4: JSON 유효성 확인**

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/ko.json','utf8'))" && echo "valid"
```

Expected: `valid`

- [ ] **Step 16.5: 빌드/타입체크 — 누락된 키 확인**

```bash
pnpm --filter @jarvis/web type-check
```

next-intl의 static type 검사가 설정되어 있다면 여기서 missing key가 에러로 잡힘. 없으면 런타임 경고만.

- [ ] **Step 16.6: Commit**

```bash
git add apps/web/messages/ko.json
git commit -m "i18n: add Architecture.BuildLifecycle/BuildStatus and Ask.graphScope keys"
```

---

## Task 17: E2E — `/ask?q=` 시나리오 (ask-scoped)

**Files:**
- Create: `apps/web/e2e/helpers/graph-fixtures.ts`
- Create: `apps/web/e2e/ask-scoped.spec.ts`

### Steps

- [ ] **Step 17.1: 기존 e2e 구조 파악**

```bash
ls apps/web/e2e/
cat apps/web/e2e/helpers/auth.ts 2>/dev/null | head -50
```

목적: 기존 Playwright fixture/helper 패턴 파악.

- [ ] **Step 17.2: graph fixture helper 작성**

`apps/web/e2e/helpers/graph-fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';

export interface SeedSnapshotOptions {
  workspaceId: string;
  status?: 'pending' | 'running' | 'done' | 'error';
  title?: string;
  scopeType?: 'attachment' | 'workspace';
  scopeId?: string;
  buildError?: string | null;
  nodes?: { nodeId: string; label: string; sourceFile?: string }[];
}

export async function seedGraphSnapshot(opts: SeedSnapshotOptions): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO graph_snapshot (
      id, workspace_id, title, scope_type, scope_id,
      build_status, build_error, analysis_metadata, updated_at
    )
    VALUES (
      ${id}, ${opts.workspaceId}, ${opts.title ?? 'Test Snapshot'},
      ${opts.scopeType ?? 'workspace'}, ${opts.scopeId ?? opts.workspaceId},
      ${opts.status ?? 'done'}, ${opts.buildError ?? null},
      '{"godNodes":[],"suggestedQuestions":[]}'::jsonb, NOW()
    )
  `);
  for (const n of opts.nodes ?? []) {
    await db.execute(sql`
      INSERT INTO graph_node (snapshot_id, node_id, label, source_file, metadata)
      VALUES (${id}, ${n.nodeId}, ${n.label}, ${n.sourceFile ?? null}, '{}'::jsonb)
    `);
  }
  return id;
}

export async function cleanupGraphFixtures(workspaceId: string): Promise<void> {
  await db.execute(sql`DELETE FROM graph_snapshot WHERE workspace_id = ${workspaceId}`);
}
```

- [ ] **Step 17.3: `ask-scoped.spec.ts` 작성**

```ts
// apps/web/e2e/ask-scoped.spec.ts

import { test, expect } from '@playwright/test';
import { loginAs, createTestUser } from './helpers/auth';
import { seedGraphSnapshot, cleanupGraphFixtures } from './helpers/graph-fixtures';

test.describe('/ask?q= URL parameters', () => {
  let workspaceId: string;
  let snapshotId: string;

  test.beforeEach(async ({ page }) => {
    const user = await createTestUser({ permissions: ['knowledge:read'] });
    workspaceId = user.workspaceId;
    snapshotId = await seedGraphSnapshot({
      workspaceId,
      title: 'Repo Alpha',
      nodes: [
        { nodeId: 'n1', label: 'UserService', sourceFile: 'src/user.ts' },
        { nodeId: 'n2', label: 'AuthModule', sourceFile: 'src/auth.ts' },
      ],
    });
    await loginAs(page, user);
  });

  test.afterEach(async () => {
    await cleanupGraphFixtures(workspaceId);
  });

  test('/ask?q=Hello auto-populates and submits the question', async ({ page }) => {
    await page.goto('/ask?q=Hello%20world');
    // Textarea populated
    await expect(page.getByRole('textbox')).toHaveValue('Hello world');
    // Answer streaming begins (we can't assert full content but spinner/stream indicator appears)
    await expect(page.locator('[data-testid="ask-streaming"], .animate-pulse, [aria-busy="true"]')).toBeVisible({ timeout: 10000 });
  });

  test('/ask?q=X&snapshot=<id> shows scope badge', async ({ page }) => {
    await page.goto(`/ask?q=UserService&snapshot=${snapshotId}`);
    await expect(page.getByText(/Repo Alpha/)).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveValue('UserService');
  });

  test('invalid snapshot id does not break the page', async ({ page }) => {
    await page.goto(`/ask?q=hi&snapshot=00000000-0000-0000-0000-000000000000`);
    // No badge
    await expect(page.getByText(/Repo Alpha/)).not.toBeVisible();
    // Question still runs
    await expect(page.getByRole('textbox')).toHaveValue('hi');
  });
});
```

**주의:** 실제 `data-testid`, selector는 AskPanel 구현에 맞춰 조정. 기존 e2e 스펙의 selector 패턴 참고.

- [ ] **Step 17.4: Playwright 테스트 실행**

```bash
pnpm --filter @jarvis/web e2e -- ask-scoped
```

Expected: 3 tests passed. 실패 시 selector 조정.

- [ ] **Step 17.5: Commit**

```bash
git add apps/web/e2e/helpers/graph-fixtures.ts apps/web/e2e/ask-scoped.spec.ts
git commit -m "test(e2e): add /ask?q= and snapshot scope E2E specs"
```

---

## Task 18: E2E — Architecture lifecycle

**Files:**
- Create: `apps/web/e2e/architecture-lifecycle.spec.ts`

### Steps

- [ ] **Step 18.1: 스펙 작성**

```ts
// apps/web/e2e/architecture-lifecycle.spec.ts

import { test, expect } from '@playwright/test';
import { loginAs, createTestUser } from './helpers/auth';
import { seedGraphSnapshot, cleanupGraphFixtures } from './helpers/graph-fixtures';

test.describe('Architecture — Build lifecycle', () => {
  let workspaceId: string;

  test.beforeEach(async ({ page }) => {
    const user = await createTestUser({ permissions: ['knowledge:read'] });
    workspaceId = user.workspaceId;
    await loginAs(page, user);
  });

  test.afterEach(async () => {
    await cleanupGraphFixtures(workspaceId);
  });

  test('shows counts for all statuses in BuildLifecycleSection', async ({ page }) => {
    await seedGraphSnapshot({ workspaceId, status: 'running', title: 'Run 1' });
    await seedGraphSnapshot({ workspaceId, status: 'pending', title: 'Wait 1' });
    await seedGraphSnapshot({ workspaceId, status: 'error', title: 'Fail 1', buildError: 'Python traceback here' });
    await seedGraphSnapshot({ workspaceId, status: 'done', title: 'OK 1' });

    await page.goto('/architecture');

    await expect(page.getByText(/진행 중/)).toBeVisible();
    await expect(page.getByText(/대기 중/)).toBeVisible();
    await expect(page.getByText(/실패/)).toBeVisible();
    await expect(page.getByText(/완료/)).toBeVisible();
  });

  test('selecting an error snapshot shows error card with buildError', async ({ page }) => {
    const errId = await seedGraphSnapshot({
      workspaceId,
      status: 'error',
      title: 'Broken Build',
      buildError: 'Traceback (most recent call last):\nFileNotFoundError: graph.json',
    });

    await page.goto(`/architecture?snapshot=${errId}`);
    await expect(page.getByText(/Broken Build/)).toBeVisible();
    await expect(page.getByText(/FileNotFoundError/)).toBeVisible();
  });

  test('selecting a running snapshot shows running card', async ({ page }) => {
    const runId = await seedGraphSnapshot({
      workspaceId,
      status: 'running',
      title: 'In Progress',
    });

    await page.goto(`/architecture?snapshot=${runId}`);
    await expect(page.getByText(/In Progress/)).toBeVisible();
  });

  test('no snapshots — shows empty state + BuildLifecycleSection with zeros', async ({ page }) => {
    await page.goto('/architecture');
    await expect(page.getByText(/아직 Graphify 분석 결과가 없습니다/)).toBeVisible();
    await expect(page.getByText(/빌드 상태/)).toBeVisible();
  });
});
```

- [ ] **Step 18.2: 테스트 실행**

```bash
pnpm --filter @jarvis/web e2e -- architecture-lifecycle
```

Expected: 4 tests passed.

- [ ] **Step 18.3: Commit**

```bash
git add apps/web/e2e/architecture-lifecycle.spec.ts
git commit -m "test(e2e): add architecture build lifecycle E2E spec"
```

---

## Final Verification

모든 task 완료 후:

- [ ] **V.1: 모든 워크스페이스 type-check**

```bash
pnpm -r type-check
```

- [ ] **V.2: 모든 워크스페이스 lint**

```bash
pnpm -r lint
```

- [ ] **V.3: 모든 단위 테스트**

```bash
pnpm -r test
```

- [ ] **V.4: E2E 테스트 전체**

```bash
pnpm --filter @jarvis/web e2e
```

- [ ] **V.5: schema drift 훅**

```bash
node scripts/check-schema-drift.mjs --hook
```

Expected: OK.

- [ ] **V.6: 수동 smoke test**

```bash
pnpm dev
```

체크리스트:
1. ZIP archive 업로드 → Architecture 페이지에서 `running` → `done` 으로 전이 확인
2. Done snapshot에서 Suggested Question 클릭 → `/ask` 에서 질문 자동 실행 + Badge 표시
3. 답변에 Graph source 카드 포함 (파란 variant)
4. 같은 archive 재업로드 → 새 snapshot 생성되지만, `SELECT COUNT(*) FROM knowledge_page WHERE source_type='graphify'`가 이전과 동일
5. 일부러 깨진 zip(예: empty zip) → Architecture에서 `error` snapshot 선택 시 buildError 표시

- [ ] **V.7: Final commit + push**

모든 변경이 개별 commit되어 있으므로 별도 merge commit 불필요. `git log --oneline -20`으로 커밋 체인 확인 후 push.

---

## Rollback Plan

문제 발견 시:

1. **마이그레이션만 롤백:** `pnpm --filter @jarvis/db db:migrate:down` (drizzle이 down을 지원 안 하면 수동 SQL — 새 컬럼/인덱스 drop + enum drop)
2. **전체 롤백:** `git revert <first-commit>..<last-commit>` + `pnpm db:migrate` (0003까지 되돌림)

기존 데이터는 backfill SQL로 `scope_type='workspace'`/`'attachment'`가 이미 들어가 있으므로, 되돌리면 그 컬럼들만 사라진다. 손실 없음.

---

**End of plan.**
