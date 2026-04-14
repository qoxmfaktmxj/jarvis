# PR#0 — Drizzle Spec 정정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/analysis/99-integration-plan.md`의 Drizzle 스키마 예시 코드를 Jarvis 실제 컨벤션과 맞추어 정정한다. 실제 런타임 코드 변경 없음 — 문서 교정만.

**Architecture:** 정정 대상 3종: (1) `vector("embedding", { dimensions: 1536 })` 표준 API → `customType<vector>` 패턴, (2) 컬럼 정의 인라인 `pgEnum(...)(...)` → 파일 top-level `pgEnum` 선언 + 컬럼은 해당 enum 변수 사용, (3) `sensitivity()` helper 사용 전제 → 별도 helper 파일 전제 명시. 실제 런타임 스키마(`packages/db/schema/knowledge.ts:23`)의 패턴을 단일 canonical 레퍼런스로 사용.

**Tech Stack:** Drizzle ORM 0.45.2, PostgreSQL + pgvector, Markdown 문서 편집.

**Spec reference:** `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#0

---

## File Structure

**Modify:**
- `docs/analysis/99-integration-plan.md` — 4개 블록 정정
  - §5.4 `document_chunks` DDL 예시 (line ~340–373)
  - §5.5 `wiki_sources` / `wiki_sources_draft` (line ~385–420)
  - §5.6 Junction tables `wiki_source_refs`, `wiki_citations` (line ~427–461)
  - §5.7 `ingest_run` (line ~465~ 해당 부분)

**Verify (no modification):**
- `packages/db/schema/knowledge.ts:23` — 단일 canonical customType vector 패턴 레퍼런스
- `scripts/check-schema-drift.mjs` — false-positive 검증에 사용

---

## Task 1: 현황 확인 및 브랜치 생성

- [ ] **Step 1: 새 worktree/브랜치 생성**

```bash
cd C:/Users/Administrator/Desktop/devdev/jarvis
git worktree add .claude/worktrees/pr0-spec-fix -b claude/phase7a-pr0-spec-fix
cd .claude/worktrees/pr0-spec-fix
```

- [ ] **Step 2: 정정 대상 라인 재확인**

Run:
```bash
grep -n -E 'vector\("|pgEnum\(.+\)\(' docs/analysis/99-integration-plan.md | head -20
```
Expected: 4+ 개의 문제 라인 출력 (document_chunks vector 라인, 인라인 pgEnum 3+개)

---

## Task 2: §5.4 `document_chunks` DDL 예시 정정

**Files:**
- Modify: `docs/analysis/99-integration-plan.md` (§5.4 코드 블록)

- [ ] **Step 1: 기존 블록 확인**

현재 예시에 포함된 문제 라인:
```ts
embedding: vector("embedding", { dimensions: 1536 }),
```

- [ ] **Step 2: customType 패턴으로 치환**

`document_chunks` 블록 상단에 customType 선언을 추가하고 컬럼 참조를 교체한다. 블록 전체를 아래로 교체:

````ts
// packages/db/schema/document-chunks.ts
import {
  pgTable, uuid, text, integer, index, unique, customType,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant";
import { sensitivity, createdAt, updatedAt } from "./_helpers";

// Jarvis 기존 패턴: packages/db/schema/knowledge.ts:23 참조
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`,
});

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),

  // Polymorphic ref (Codex P0 #4 타협): documentType + documentId + 별도 junction은 과도
  // → 대신 CHECK constraint으로 documentType 값 한정 + 애플리케이션 레벨 FK guard
  documentType: text("document_type").notNull(), // 'knowledge_page' | 'wiki_sources' | 'wiki_syntheses' | ...
  documentId: uuid("document_id").notNull(),

  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  embedding: vector("embedding"),
  tokens: integer("tokens").notNull(),
  sensitivity: sensitivity(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  uniq: unique().on(t.documentType, t.documentId, t.chunkIndex),
  docIdx: index("document_chunks_doc_idx").on(t.documentType, t.documentId),
  hashIdx: index("document_chunks_hash_idx").on(t.contentHash),
  // IVFFlat 인덱스는 raw SQL migration에서 (프로젝트 컨벤션)
  // CREATE INDEX document_chunks_vec_idx ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  workspaceIdx: index("document_chunks_ws_idx").on(t.workspaceId),
}));
````

핵심 변경:
- `vector("embedding", { dimensions: 1536 })` → `vector("embedding")` (customType이 차원 고정)
- 파일 상단에 `customType<vector>` 선언 추가 + 주석으로 기존 패턴 참조 명시

- [ ] **Step 3: 편집 후 라인 재확인**

Run:
```bash
grep -n 'vector("embedding"' docs/analysis/99-integration-plan.md
```
Expected: `document_chunks`의 `embedding: vector("embedding"),` 한 건만, `{ dimensions: 1536 }` 인자 없어야 함.

- [ ] **Step 4: 커밋**

```bash
git add docs/analysis/99-integration-plan.md
git commit -m "docs(spec-fix): document_chunks 예시를 customType vector 패턴으로 정정"
```

---

## Task 3: §5.5 wiki_sources / wiki_sources_draft 정정

**Files:**
- Modify: `docs/analysis/99-integration-plan.md` (§5.5 코드 블록)

- [ ] **Step 1: 인라인 pgEnum 식별**

현재 문제 라인:
```ts
reviewStatus: pgEnum("review_status", ["pending", "approved", "rejected", "expired"])("review_status").notNull().default("pending"),
```

- [ ] **Step 2: top-level로 승격 + 컬럼은 변수 참조**

파일 상단 `sourceKindEnum` 선언 바로 아래에 `reviewStatusEnum`을 추가하고, 컬럼 정의는 변수 참조로 변경. `wiki_sources_draft` 블록 전체:

````ts
// wiki_sources_draft — Heal/LLM 자동 생성물은 여기 먼저
export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "rejected", "expired"]);

export const wikiSourcesDraft = pgTable("wiki_sources_draft", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  originatingRunId: uuid("originating_run_id"),      // ingest_run 또는 heal_run 참조
  proposedData: jsonb("proposed_data").notNull(),    // 동일 구조 JSON
  reviewStatus: reviewStatusEnum("review_status").notNull().default("pending"),
  reviewedByUserId: uuid("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
});
````

핵심 변경:
- `reviewStatus:` 컬럼 정의가 인라인 `pgEnum(...)("review_status")`가 아니라 top-level 선언된 `reviewStatusEnum` 변수를 참조
- `sourceKindEnum`은 이미 top-level로 선언돼 있어 수정 불요 (확인만)

- [ ] **Step 3: 확인 + 커밋**

```bash
grep -n 'pgEnum(' docs/analysis/99-integration-plan.md | head -10
# wiki_sources_draft 섹션 내에는 인라인 pgEnum이 없어야 함
git add docs/analysis/99-integration-plan.md
git commit -m "docs(spec-fix): wiki_sources_draft의 reviewStatus를 top-level enum으로 분리"
```

---

## Task 4: §5.6 junction tables 정정 (wiki_source_refs, wiki_citations)

**Files:**
- Modify: `docs/analysis/99-integration-plan.md` (§5.6 코드 블록)

- [ ] **Step 1: 두 블록의 인라인 pgEnum 식별**

문제 라인:
```ts
refererType: pgEnum("referer_type", [...])("referer_type").notNull(),
citedType: pgEnum("cited_type", [...])("cited_type").notNull(),
```

- [ ] **Step 2: §5.6 블록 전체를 아래로 교체**

````ts
// packages/db/schema/wiki-junction.ts
import { pgTable, uuid, text, pgEnum, integer, index, unique } from "drizzle-orm/pg-core";
import { workspace } from "./tenant";
import { createdAt } from "./_helpers";

// Top-level enum declarations (Jarvis 컨벤션)
export const refererTypeEnum = pgEnum("referer_type", [
  "wiki_entity", "wiki_concept", "wiki_synthesis", "case",
]);

export const citedTypeEnum = pgEnum("cited_type", [
  "wiki_sources", "knowledge_page", "case", "directory", "wiki_concept",
]);

// wiki_source_refs: wiki_entities / wiki_concepts / wiki_syntheses가 어느 wiki_sources를 참조하는지
export const wikiSourceRefs = pgTable("wiki_source_refs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  refererType: refererTypeEnum("referer_type").notNull(),
  refererId: uuid("referer_id").notNull(),
  sourceId: uuid("source_id").notNull(),  // wiki_sources.id (FK 강제 어려움 — trigger로 보정 또는 nullable)
  relation: text("relation"),              // 'mentions' | 'defines' | 'cites' | ...
  createdAt: createdAt(),
}, (t) => ({
  refererIdx: index("wiki_source_refs_referer_idx").on(t.refererType, t.refererId),
  sourceIdx: index("wiki_source_refs_source_idx").on(t.sourceId),
  uniq: unique().on(t.refererType, t.refererId, t.sourceId, t.relation),
}));

// wiki_citations: wiki_syntheses.answer 안에서 참조한 문서들
export const wikiCitations = pgTable("wiki_citations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  synthesisId: uuid("synthesis_id").notNull(),       // FK → wiki_syntheses.id
  citationIndex: integer("citation_index").notNull(), // [1], [2], [3]
  citedType: citedTypeEnum("cited_type").notNull(),
  citedId: uuid("cited_id").notNull(),
  snippet: text("snippet"),
  createdAt: createdAt(),
}, (t) => ({
  synIdx: index("wiki_citations_syn_idx").on(t.synthesisId),
  citedIdx: index("wiki_citations_cited_idx").on(t.citedType, t.citedId),
}));
````

핵심 변경:
- `refererTypeEnum`, `citedTypeEnum`를 top-level로 선언
- 컬럼 정의는 변수 참조로 교체
- import에서 `pgEnum` 그대로 유지 (선언에 필요)

- [ ] **Step 3: 확인 + 커밋**

```bash
# §5.6 섹션 범위에서 인라인 pgEnum 없는지 확인
awk '/### 5.6/,/### 5.7/' docs/analysis/99-integration-plan.md | grep -nE 'pgEnum\(.+\)\('
# 결과: 없어야 함 (hit 0)
git add docs/analysis/99-integration-plan.md
git commit -m "docs(spec-fix): junction table의 pgEnum을 top-level로 분리"
```

---

## Task 5: §5.7 `ingest_run` 확인 (이미 올바르면 no-op)

**Files:**
- Read: `docs/analysis/99-integration-plan.md` §5.7 (line ~465–)

- [ ] **Step 1: §5.7 블록 확인**

Run:
```bash
awk '/### 5.7/,/### 5\.[89]/' docs/analysis/99-integration-plan.md | grep -nE 'pgEnum\(|vector\("'
```

- [ ] **Step 2: 판정**

- `ingestStatusEnum`이 이미 top-level로 선언돼 있고 컬럼은 변수 참조 형태면 **no-op**, 다음 Task로.
- 만약 인라인 `pgEnum(...)(...)` 패턴이 발견되면, Task 4와 동일한 top-level 승격 방식으로 정정하고 커밋:

```bash
git add docs/analysis/99-integration-plan.md
git commit -m "docs(spec-fix): ingest_run enum을 top-level로 분리"
```

- [ ] **Step 3: §5 전체 범위 최종 확인**

```bash
awk '/## 5\./,/## 6\./' docs/analysis/99-integration-plan.md | grep -cE 'pgEnum\(.+\)\('
```
Expected: `0` (인라인 패턴 전멸)

```bash
awk '/## 5\./,/## 6\./' docs/analysis/99-integration-plan.md | grep -cE 'vector\("[^"]+", \{'
```
Expected: `0` (표준 API `vector(name, { dimensions })` 전멸)

---

## Task 6: schema-drift hook false-positive 검증

**Files:**
- Run: `scripts/check-schema-drift.mjs`

- [ ] **Step 1: hook 직접 실행**

Run:
```bash
node scripts/check-schema-drift.mjs --hook
```
Expected: exit 0 또는 advisory-only (integration-plan.md는 실제 스키마 소스가 아니므로 hook이 오탐해선 안 됨)

- [ ] **Step 2: 만약 오탐 발생 시**

hook의 스캔 범위가 `docs/` 포함하도록 돼 있다면, plan 내에선 수정하지 말고 스펙의 "Future work"에 hook 스캔 범위 보정 항목을 메모로 남긴다. 이는 PR#4 (schema-drift hook 강화)의 범위.

Run:
```bash
# hook 출력 저장
node scripts/check-schema-drift.mjs --hook > /tmp/hook-output.txt 2>&1 || true
cat /tmp/hook-output.txt
```

- [ ] **Step 3: 결과 기록**

PR 본문에 아래 체크를 포함:
```
- [x] §5.4 document_chunks: customType vector 적용
- [x] §5.5 wiki_sources_draft: reviewStatusEnum top-level
- [x] §5.6 junction: refererTypeEnum, citedTypeEnum top-level
- [x] §5.7 ingest_run: (no-op 또는 정정 커밋)
- [x] schema-drift hook false-positive 없음 (또는 PR#4로 이관 메모)
```

---

## Task 7: PR 생성

- [ ] **Step 1: origin push**

```bash
git push -u origin claude/phase7a-pr0-spec-fix
```

- [ ] **Step 2: PR 생성**

```bash
gh pr create --title "docs(spec-fix): Drizzle 예시를 Jarvis 컨벤션으로 정정 (PR#0)" --body "$(cat <<'EOF'
## Summary

- §5.4 `document_chunks`: `vector("embedding", { dimensions: 1536 })` → `customType<vector>` 패턴 (knowledge.ts:23 레퍼런스)
- §5.5 `wiki_sources_draft`: 인라인 `pgEnum(...)()` → top-level `reviewStatusEnum`
- §5.6 junction tables: `refererTypeEnum`, `citedTypeEnum` top-level 선언
- §5.7 `ingest_run`: 확인 (이미 올바르면 no-op)

이 PR은 `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#0에 정의된 선행 작업이며, 7A 나머지 PR들이 올바른 스타일로 작성될 수 있도록 전제 조건을 만든다. 실제 런타임 코드 변경 없음.

## Test plan
- [ ] `grep -cE 'pgEnum\(.+\)\(' docs/analysis/99-integration-plan.md §5 == 0`
- [ ] `grep -cE 'vector\("[^"]+", \{' docs/analysis/99-integration-plan.md §5 == 0`
- [ ] `node scripts/check-schema-drift.mjs --hook` false-positive 없음

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: PR URL 기록**

PR URL을 spec의 §9 Revision log에 한 줄 추가:
```
| 2026-04-XX | PR#0 머지 | <PR URL> |
```

---

## Self-Review Checklist

- [ ] `docs/analysis/99-integration-plan.md` §5 내 인라인 `pgEnum(...)("col")` 패턴 0건
- [ ] `vector(name, { dimensions })` 표준 API 0건 (customType `vector(name)` 형태만)
- [ ] 편집된 블록 내 import 문이 사용하는 심볼과 일치 (pgEnum import 누락 없음)
- [ ] `_helpers` import 경로 일관성 (`"./_helpers"`)
- [ ] 커밋 메시지가 세분화됨 (Task당 1커밋)
- [ ] 실제 런타임 코드 변경 0건 (문서만)
