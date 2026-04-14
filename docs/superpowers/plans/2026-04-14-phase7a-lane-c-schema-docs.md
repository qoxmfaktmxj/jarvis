# Phase-7A Lane C — Schema Drift + document_chunks DDL + Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lane C (PR#4 schema-drift hook 강화 + PR#7 `document_chunks` DDL write-path off + PR#8 문서 2종)을 TDD로 구현해 G5 게이트(의도적 drift에서 CI 실패)와 `document_chunks` 테이블 존재 및 Phase-6↔7 추적성을 확보한다.

**Architecture:** `scripts/check-schema-drift.mjs`는 기존 advisory hook 모드에 더해 `--ci`/`--precommit` 블로킹 모드를 추가해 Node `node:test` 기반 self-test로 검증한다. `packages/db/schema/document-chunks.ts`는 `knowledge.ts`의 `customType<vector>` 1536d 패턴을 재사용하고, 실제 insert는 `packages/db/writers/document-chunks.ts`의 `FEATURE_DOCUMENT_CHUNKS_WRITE` 플래그 가드 뒤로만 열린다. 문서 2종은 Phase-6↔7 매핑표(`docs/analysis/06-phase6-phase7-mapping.md`)와 Lane A/B separate-lane 경고(`packages/search/README.md`)를 코드와 동일 워트리에서 같이 출고한다.

**Tech Stack:** node:test (hook self-test), Drizzle + pgvector IVFFlat, Markdown.

**Spec reference:** `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §3 PR#4, §3 PR#7, §3 PR#8, §4 G5, §5.1, §5.2.

---

## 0. 선제 원칙

- **작업 순서**: PR#4 → PR#7 → PR#8. PR#7의 writer 스텁 unit 테스트 외에는 schema→migration 흐름을 깨지 않는다.
- **TDD**: 훅 자체 테스트(PR#4), writer 스텁 throw 테스트(PR#7). 문서는 tests 없음(링크 스모크로 대신).
- **No placeholder**: 아래 §5 이하에 새 파일 전문(full content)을 그대로 박아 넣음. 구현자는 복사 + `today`/경로만 맞추면 됨.
- **Branch**: `claude/phase7a-lane-c-schema-docs` (작업 워트리). 각 PR은 base=main 기준.
- **Today**: 2026-04-14.
- **파일 경로는 모두 POSIX 표기**로 적되, 실제 실행은 Windows bash(GitWindows)에서 이루어진다(주의: 경로에 공백 있을 수 있음 → 따옴표로 감쌀 것).

---

## 1. 워트리·브랜치 준비

- [ ] 1.1 현재 워트리가 `.claude/worktrees/zealous-shannon`인지 확인: `git rev-parse --show-toplevel` 출력 끝이 `zealous-shannon`.
- [ ] 1.2 `git status` 클린 확인(신규 변경 없음).
- [ ] 1.3 브랜치 전환: `git switch -c claude/phase7a-lane-c-schema-docs`. 이미 존재 시 `git switch claude/phase7a-lane-c-schema-docs`.
- [ ] 1.4 `git log --oneline -3`으로 `c5ef7e9 docs(analysis): Phase-7 plan v2 after 3-way review` 등 최신 커밋 위에서 시작하는지 확인.

---

## 2. PR#4 — schema-drift hook 강화

### 2.1 현재 동작 스냅샷

- [ ] 2.1.1 `scripts/check-schema-drift.mjs` 전체를 읽고, 요약 주석(2–3줄)을 plan notes(커밋 메시지용 초고)로 남긴다. 핵심 요약:
  - **Hook 모드(`--hook`)**: stdin JSON → `tool_input.file_path`가 schema 파일일 때만 drift 감지, 그러나 **항상 exit 0** (advisory). 경고는 stderr.
  - **Manual/CI 모드(인자 없음)**: drift면 exit 1, 없으면 exit 0. CI에서 이미 블로킹 가능하지만 **의도 모호**(manual과 CI가 같은 경로).
  - **허용 오차**: `TOLERANCE_MS=500`.
  - **판정 기준**: `packages/db/schema/*.ts`의 최신 mtime vs `packages/db/drizzle/meta/_journal.json` mtime.

### 2.2 변경 설계 (의도 명시)

- [ ] 2.2.1 모드 매트릭스 확정:
  - `--hook` → advisory (exit 0). **유지**.
  - `--ci` → **blocking (exit 1 on drift)**. 신규 명시적 플래그.
  - `--precommit` → blocking (exit 1 on drift). 신규, `--ci`와 동일 로직이지만 메시지에 "local pre-commit" 안내.
  - 인자 없음 → 기존과 동일하게 manual 모드(사람용 출력, exit 1 on drift). 하위호환 유지.
- [ ] 2.2.2 공통 헬퍼 `reportDrift(result, { mode })` 하나로 출력 문구만 분기.
- [ ] 2.2.3 종료 코드 보장:
  - `--hook` 분기에서는 drift 있더라도 `process.exit(0)` 유지.
  - `--ci` / `--precommit` 분기에서는 drift면 `process.exit(1)`.
  - 모드 중복(`--hook --ci` 등) 시 `--hook`이 이긴다(Claude PostToolUse 흐름 안전 우선).

### 2.3 자체 테스트 먼저 작성 (TDD: RED)

- [ ] 2.3.1 `scripts/tests/` 디렉터리 생성 확인(없으면 `mkdir -p scripts/tests`).
- [ ] 2.3.2 `scripts/tests/check-schema-drift.test.mjs` 신규 작성. 사용 도구: `node:test`, `node:assert/strict`, `node:child_process.spawnSync`.
  - 테스트 전략: 임시 작업 디렉터리를 `os.tmpdir()`에 만들고 아래 구조를 복제:
    ```
    tmp/
      packages/db/schema/sample.ts      (mtime = now)
      packages/db/drizzle/meta/_journal.json (mtime = now - 10s)
    ```
  - `spawnSync(process.execPath, [scriptPath, "--ci"], { cwd: tmp })` 실행 → `status`가 1이어야 함.
  - No-drift 케이스: journal mtime을 schema mtime보다 **뒤로** 설정 → `--ci` exit 0.
  - `--hook` 케이스: stdin으로 `{ tool_input: { file_path: "<schema 파일 abs>" } }` 주입 → drift 있어도 exit 0.
  - `--precommit` 케이스: `--ci`와 동일하게 drift 시 exit 1.
- [ ] 2.3.3 먼저 실행: `node --test scripts/tests/check-schema-drift.test.mjs` → **FAIL**(아직 `--ci`/`--precommit` 분기 없음) 확인. 실패 메시지를 커밋 로그에 남길 plan notes에 기록.

### 2.4 구현 (TDD: GREEN)

- [ ] 2.4.1 `scripts/check-schema-drift.mjs` 상단 주석 "세 가지 실행 모드"를 "네 가지 실행 모드"로 갱신. `--ci`, `--precommit` 설명 추가.
- [ ] 2.4.2 기존 `const HOOK_MODE = process.argv.includes("--hook");` 아래에 다음 추가:
  ```js
  const CI_MODE = process.argv.includes("--ci");
  const PRECOMMIT_MODE = process.argv.includes("--precommit");
  ```
- [ ] 2.4.3 Hook 분기는 그대로 유지(가장 먼저 평가, drift 있어도 exit 0).
- [ ] 2.4.4 Hook 이후 로직을 다음과 같이 재구성:
  ```js
  // ----- CI / pre-commit / manual mode -------------------------------------
  const result = checkDrift();

  if (result.reason === "no-journal") {
    if (CI_MODE || PRECOMMIT_MODE) {
      console.error("❌ drizzle/meta/_journal.json missing in CI/pre-commit mode.");
      process.exit(1);
    }
    console.log(
      "ℹ️  drizzle/meta/_journal.json이 없습니다. " +
      "첫 마이그레이션 전으로 가정하고 통과합니다."
    );
    process.exit(0);
  }

  if (result.drift) {
    const prefix = PRECOMMIT_MODE
      ? "❌ [pre-commit] Schema drift detected."
      : CI_MODE
        ? "❌ [CI] Schema drift detected."
        : "❌ Schema drift detected.";
    console.error(
      `${prefix}\n` +
      `   packages/db/schema/*.ts가 마이그레이션보다 ${result.ageSeconds}초 앞서 있습니다.\n` +
      `   'pnpm db:generate'를 실행해 동기화하세요.`
    );
    process.exit(1);
  }

  console.log("✅ No schema drift. (스키마와 마이그레이션이 동기화되어 있습니다.)");
  process.exit(0);
  ```
- [ ] 2.4.5 `node --test scripts/tests/check-schema-drift.test.mjs` 재실행 → 전부 PASS.
- [ ] 2.4.6 `node scripts/check-schema-drift.mjs` (수동 모드) 실제 리포 기준 실행 → drift 없음 예상 (✅ 메시지).
- [ ] 2.4.7 `node scripts/check-schema-drift.mjs --ci` 실행 → 동일. stdout/stderr 기록.

### 2.5 실제 drift 재현 (안전 실증)

- [ ] 2.5.1 안전 재현: `packages/db/schema/knowledge.ts`의 mtime만 갱신(내용 변경 없이):
  - Git 추적 중인 파일은 건드리지 않기 위해 임시 스키마 파일로 실험:
    ```bash
    touch packages/db/schema/__drift_probe.ts
    node scripts/check-schema-drift.mjs --ci; echo "exit=$?"
    ```
  - 결과: exit 1과 `❌ [CI] Schema drift detected.` 출력. 캡처해 plan notes에 붙인다.
- [ ] 2.5.2 정리: `rm packages/db/schema/__drift_probe.ts` → 재검증 `node scripts/check-schema-drift.mjs --ci` → exit 0.

### 2.6 CI wiring (advisory)

- [ ] 2.6.1 `.github/workflows/` 확인. 존재하지 않으면 이 PR에서 **생성하지 않고** Lane D PR#9에 넘긴다. Plan notes에 "CI wiring은 Lane D PR#9에서 `pnpm test:integration`과 함께 `node scripts/check-schema-drift.mjs --ci` 삽입"라고 기록.
- [ ] 2.6.2 존재하면 기존 워크플로우의 `jobs.<jobname>.steps`에 다음 step만 추가(다른 로직 변경 금지):
  ```yaml
  - name: Schema drift guard (blocking)
    run: node scripts/check-schema-drift.mjs --ci
  ```

### 2.7 문서 업데이트

- [ ] 2.7.1 `CLAUDE.md` 18–20번째 줄 근처 훅 설명을 확인 후, 블로킹 모드 추가를 반영:
  > 훅: `.claude/settings.json` (PostToolUse → `scripts/check-schema-drift.mjs --hook`, advisory). CI/pre-commit은 동일 스크립트에 `--ci`/`--precommit`을 붙여 블로킹.
- [ ] 2.7.2 `AGENTS.md`에 동일 문구 반영(1~2 줄).

### 2.8 PR#4 커밋 & 푸시

- [ ] 2.8.1 스테이지 파일: `scripts/check-schema-drift.mjs`, `scripts/tests/check-schema-drift.test.mjs`, `CLAUDE.md`, `AGENTS.md`(있으면).
- [ ] 2.8.2 커밋:
  ```
  feat(tools): schema-drift hook에 --ci/--precommit blocking 모드 추가

  - advisory hook 모드는 유지(PostToolUse 흐름 안전)
  - --ci / --precommit 에서는 drift 시 exit 1
  - node:test 기반 self-test 추가 (scripts/tests/check-schema-drift.test.mjs)
  - CI 스텝 추가는 Lane D PR#9로 이관
  ```
- [ ] 2.8.3 `git push -u origin claude/phase7a-lane-c-schema-docs`.
- [ ] 2.8.4 PR 생성은 §4 끝에서 일괄 처리(3 PRs 분리).

---

## 3. PR#7 — `document_chunks` DDL (write path flag off)

### 3.1 schema 파일 작성

- [ ] 3.1.1 `packages/db/schema/document-chunks.ts` 신규 파일. 아래 **전문**을 그대로 쓴다(`customType<vector>`는 knowledge.ts의 1536d 패턴과 동일).

```ts
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

/**
 * packages/db/schema/document-chunks.ts
 *
 * Phase-7A PR#7 — document_chunks 테이블 (write path flag off)
 *
 * - OpenAI 1536d 임베딩을 담는 Lane A 본체.
 * - precedent_case(Lane B, TF-IDF+SVD 1536d)와는 **절대 같은 인덱스/UNION 금지**.
 *   (자세한 경고는 packages/search/README.md 참조)
 * - 7A에서는 DDL만 존재. 실제 write는 packages/db/writers/document-chunks.ts의
 *   FEATURE_DOCUMENT_CHUNKS_WRITE 플래그 뒤에서만 열린다.
 */

const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    documentId: uuid("document_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding"),
    tokens: integer("tokens").notNull(),
    sensitivity: varchar("sensitivity", { length: 30 })
      .default("INTERNAL")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    docChunkUniq: uniqueIndex("document_chunks_doc_chunk_uniq").on(
      t.documentType,
      t.documentId,
      t.chunkIndex
    ),
    docIdx: index("document_chunks_doc_idx").on(t.documentType, t.documentId),
    hashIdx: index("document_chunks_hash_idx").on(t.contentHash),
    wsIdx: index("document_chunks_ws_idx").on(t.workspaceId)
  })
);

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
```

- [ ] 3.1.2 `packages/db/schema/index.ts`(있다면) export 추가: `export * from "./document-chunks.js";`. 없으면 스킵.

### 3.2 마이그레이션 생성 (Drizzle 정규 플로우)

> **중요**: `packages/db/drizzle/meta/_journal.json`은 **Drizzle이 자동 관리**한다. 수동으로 편집하지 않는다. 기존 migration SQL 파일도 수동 수정하지 않는다. 아래 플로우는 `pnpm db:generate` → 검사 → `pnpm db:migrate`로 고정.

- [ ] 3.2.1 `pnpm db:generate` 실행. Drizzle이 schema 변경을 감지해 새 마이그레이션 SQL과 스냅샷을 생성하고 `_journal.json`을 자동 갱신한다. 생성된 파일 경로를 기록(예: `packages/db/drizzle/0011_document_chunks.sql` 형태 — 실제 번호는 현재 max+1).
- [ ] 3.2.2 생성된 SQL을 열어(편집 금지, 읽기만) 다음 항목 존재 확인:
  - `CREATE TABLE "document_chunks"` with `embedding vector(1536)`
  - 3개 index + 1개 unique index
  - FK `workspace_id` → `workspace(id) ON DELETE CASCADE`
- [ ] 3.2.3 누락된 항목이 있으면 **SQL을 손대지 말고** `packages/db/schema/document-chunks.ts`를 수정한 뒤 `pnpm db:generate`를 다시 실행. Drizzle이 diff migration을 추가하거나 기존 것을 regen한다.
- [ ] 3.2.4 `packages/db/drizzle/meta/_journal.json`, `packages/db/drizzle/meta/<N>_snapshot.json`이 자동 갱신되었는지 `git status`로 확인 → `node scripts/check-schema-drift.mjs --ci` → exit 0.

### 3.3 IVFFlat 보조 마이그레이션 (필요 시, Drizzle이 vector ANN index를 지원하지 않기 때문)

> **caveat**: Drizzle `_journal.json`은 원칙적으로 자동 관리. IVFFlat 보조 migration이 필요한 경우에만 `_journal.json`에 엔트리를 수동 추가하되, 기존 엔트리와 동일한 shape(`idx`, `when`, `tag`, `breakpoints`)을 복제해 inconsistency를 피한다. 가능한 경우 Drizzle `sql` tagged 템플릿이나 post-migration hook 사용을 우선 고려한다.

- [ ] 3.3.1 3.2.2에서 생성 SQL에 IVFFlat 인덱스가 포함되어 있으면 본 섹션 전체 스킵(드묾 — 대부분의 Drizzle 버전은 vector ANN을 생성하지 않음).
- [ ] 3.3.2 포함되지 않았을 때의 **권장 경로 A (Drizzle sql 템플릿)**: `packages/db/schema/document-chunks.ts`의 테이블 정의 아래에 Drizzle `sql` 태그 template로 raw CREATE INDEX를 선언하거나, post-migration hook(리포에 기존 hook 러너가 있는 경우)을 이용. 이 경로로 처리 가능하면 3.3.3 스킵.
- [ ] 3.3.3 **차선 경로 B (수동 보조 SQL + _journal 엔트리 복제)**: 경로 A가 리포 관례상 쓰기 어렵다면 보조 migration을 만든다.
  - 3.3.2에서 생성된 migration 번호가 `0011_document_chunks.sql`이라고 가정하면, 그 다음 번호(`0012_document_chunks_ivfflat.sql`)로 **새 파일**을 추가하되 Drizzle이 픽업하도록 한다. 기존 migration SQL은 **절대 편집하지 않는다**.
  - 파일: `packages/db/drizzle/<NEXT_N>_document_chunks_ivfflat.sql`
  - 내용:
    ```sql
    -- Phase-7A PR#7 supplement: IVFFlat ANN index on document_chunks.embedding.
    -- cosine operator class matches OpenAI 1536d 임베딩의 저장 방식과 일치.
    CREATE INDEX IF NOT EXISTS document_chunks_vec_idx
      ON document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    ```
  - `_journal.json`에 **수동 엔트리 추가**: 기존 마지막 엔트리의 shape을 그대로 복제해 `idx = 기존 max + 1`, `when = Date.now()` 등을 채운다. 필드 이름/순서를 바꾸지 않는다. diff를 PR body에 명시적으로 기록해 리뷰어가 확인하게 한다.
  - 경로 B를 쓴 경우 plan notes에 "Drizzle이 IVFFlat을 미지원해 수동 보조 migration을 추가했고 _journal.json에 기존 shape을 복제한 엔트리 1개만 추가함" 문구를 남긴다.

### 3.4 마이그레이션 적용

- [ ] 3.4.1 로컬 개발 DB에 `pnpm db:migrate` 실행(리포에 정의되어 있지 않으면 Drizzle CLI 직접 호출 — §8 Open questions 참조).
- [ ] 3.4.2 psql(or Drizzle Studio)로 테이블 확인: `\d document_chunks`. IVFFlat index 존재 여부도 `\di document_chunks_vec_idx`로 확인.
- [ ] 3.4.3 `node scripts/check-schema-drift.mjs --ci` → exit 0.

### 3.5 feature flag + writer 스텁 (TDD: RED → GREEN)

- [ ] 3.5.1 **실패하는 테스트 먼저 작성** (`packages/db/writers/document-chunks.test.ts`). 리포가 vitest면 아래 그대로, node:test면 `node:test` + `node:assert/strict`로 변환:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";

  describe("writeChunks (flag-guarded stub)", () => {
    const PREV = process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;

    afterEach(() => {
      if (PREV === undefined) delete process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;
      else process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = PREV;
    });

    it("throws when flag is undefined (default)", async () => {
      delete process.env.FEATURE_DOCUMENT_CHUNKS_WRITE;
      const { writeChunks } = await import("./document-chunks.ts");
      await expect(async () => writeChunks([])).rejects.toThrow(/disabled/);
    });

    it("throws when flag = 'false' (string)", async () => {
      process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = "false";
      const { writeChunks } = await import("./document-chunks.ts");
      await expect(async () => writeChunks([])).rejects.toThrow(/disabled/);
    });

    it("throws 'not landed' when flag = 'true' (7A has no impl yet)", async () => {
      process.env.FEATURE_DOCUMENT_CHUNKS_WRITE = "true";
      const { writeChunks } = await import("./document-chunks.ts");
      await expect(async () => writeChunks([])).rejects.toThrow(/not landed/);
    });
  });
  ```
  - 동기 throw 함수라면 `expect(() => writeChunks([])).toThrow(...)` 형태로 대체.
- [ ] 3.5.2 **실행 → FAIL 예상**: `pnpm -F @jarvis/db test writers` (또는 리포 동등 명령). 아직 `feature-flags.ts` / `writers/document-chunks.ts`가 없어 import 실패해야 한다. 실패 출력을 plan notes에 기록.
- [ ] 3.5.3 `packages/db/feature-flags.ts` 존재 여부 확인. 없으면 생성:
  ```ts
  // packages/db/feature-flags.ts
  // 중앙화된 DB 관련 feature flag 읽기. 모든 flag는 기본 false.
  export function featureDocumentChunksWrite(): boolean {
    return process.env.FEATURE_DOCUMENT_CHUNKS_WRITE === "true";
  }
  ```
- [ ] 3.5.4 `packages/db/writers/document-chunks.ts` 신규 작성 (테스트가 기대하는 메시지와 매칭: `/disabled/`, `/not landed/`):
  ```ts
  import { featureDocumentChunksWrite } from "../feature-flags.js";
  import type { NewDocumentChunk } from "../schema/document-chunks.js";

  /**
   * Phase-7A PR#7 — document_chunks write path guard stub.
   *
   * 7A에서는 실제 insert 경로가 없다. 7B에서 이 함수에 실 insert를 붙일 예정.
   * 지금은 플래그 가드만 둬서 누군가가 "먼저" write를 시도할 경우 즉시 실패시킨다.
   */
  export function writeChunks(_chunks: NewDocumentChunk[]): never {
    if (!featureDocumentChunksWrite()) {
      throw new Error(
        "document_chunks write path is disabled (FEATURE_DOCUMENT_CHUNKS_WRITE=false). " +
        "Phase-7B 이후 활성화 예정."
      );
    }
    throw new Error(
      "document_chunks write path is enabled via flag, but implementation is not landed yet (Phase-7B)."
    );
  }
  ```
- [ ] 3.5.5 **실행 → PASS**: `pnpm -F @jarvis/db test writers`로 3개 케이스 전부 PASS 확인.

### 3.6 PR#7 커밋 & 푸시

- [ ] 3.6.1 스테이지:
  - `packages/db/schema/document-chunks.ts`
  - `packages/db/schema/index.ts` (있으면 변경)
  - `packages/db/drizzle/<NEW_MIGRATION>.sql`
  - `packages/db/drizzle/meta/_journal.json`
  - `packages/db/drizzle/<N>_document_chunks_ivfflat.sql` (필요 시)
  - `packages/db/feature-flags.ts`
  - `packages/db/writers/document-chunks.ts`
  - `packages/db/writers/document-chunks.test.ts`
- [ ] 3.6.2 커밋:
  ```
  feat(db): document_chunks DDL 추가 (write path flag off)

  - schema: customType<vector>(1536) + 3 indexes + unique(doc_type, doc_id, chunk_idx)
  - migration: Drizzle 생성본 + IVFFlat 보조 SQL (필요 시)
  - guard: FEATURE_DOCUMENT_CHUNKS_WRITE=false 기본, writeChunks()는 throw
  - unit: 플래그 on/off 양쪽에서 throw 검증
  - 참고: Lane B(precedent_case)와 절대 같은 인덱스/UNION 금지 — packages/search/README 참조
  ```
- [ ] 3.6.3 `git push`.

---

## 4. PR#8 — 문서 2종

### 4.1 `docs/analysis/06-phase6-phase7-mapping.md`

- [ ] 4.1.1 신규 파일 생성, 아래 **전문**을 그대로 쓴다(약 180 lines 예상).

```markdown
---
title: Phase-6 ↔ Phase-7 매핑
date: 2026-04-14
status: reference
related:
  - docs/superpowers/specs/2026-04-14-phase7-v3-design.md
  - docs/analysis/99-review-summary.md
  - docs/analysis/99-integration-plan.md
---

# Phase-6 ↔ Phase-7 매핑

## 1. 배경

**Phase-6**은 Debt Radar + Drift Detection 트랙으로, Jarvis 모노레포의 누적 기술부채와 schema/문서 drift를 정적 분석·감사 관점에서 탐지·점수화하는 데 집중했다. 산출물은 "어디에 어떤 위험이 있는가"의 레지스터지, 해소 액션은 다른 트랙으로 넘기는 구조다.

**Phase-7 v3**은 LLM 의존 기능을 안전하게 확장 가능하도록 만드는 **인프라 게이트**다(`docs/superpowers/specs/2026-04-14-phase7-v3-design.md`). 관측·비용·PII·테넌트·캐시·eval·schema DDL·문서·CI의 9개 PR로 구성되며, 각 PR이 완료되면 숫자 게이트(G1–G7)로 7B 진입 여부를 판단한다.

**왜 매핑이 필요한가.** Phase-6에서 발견된 각 위험이 Phase-7의 어느 PR에서 해소되는지, 어느 게이트에서 검증되는지 **역추적 가능**해야 한다. 그렇지 않으면 (a) 동일 위험이 재발해도 원인을 식별할 수 없고, (b) 7A가 끝난 뒤 "무엇이 남았는가"를 판단할 근거가 사라진다. 본 문서는 그 매핑을 테이블 하나로 고정한다.

## 2. 매핑표

| Phase-6 탐지 | 심각도 | Phase-7 해소 | 게이트 |
|---|---|---|---|
| schema drift | P0 | PR#4 (hook 강화 + CI blocking) | G5 |
| PII leak 가능성 | P0 | PR#3 (redactor + review_queue + 자동 sensitivity 승급) | G2 / G3 |
| cross-workspace data bleed | P0 | PR#9 (integration 테스트 계층) | G4 |
| LLM cost 폭주 | P1 | PR#2 (daily budget kill-switch + 대시보드) | G1 |
| 관측 불가 (LLM 호출 트레이싱 부재) | P1 | PR#1 (`llm_call_log` + pino + Sentry) | G7 |
| cache poisoning (workspace 혼입) | P1 | PR#5 (cache key에 `workspaceId` + `sensitivityScope` 포함) | — |
| eval 없는 LLM 회귀 | P2 | PR#6 (markdown fixture 30쌍 + harness) | G6 |
| knowledge_claim / document_chunks 분열 | P2 | 7A는 DDL만 (PR#7), dual-read/cutover는 7B 이후 별도 판단 | — |

### 2.1 심각도 정의 (Phase-6 척도 재게시)

- **P0**: 운영 중 데이터 유출·무결성 손상 위험 또는 장애 직결.
- **P1**: 단기 비용·성능·신뢰도 회귀를 일으키지만 격리 가능.
- **P2**: 중장기 유지보수 부담, 당장 장애로는 번지지 않음.

### 2.2 게이트 매핑 요약

- `G1 비용 차단`: PR#2 → `llm_call_log.blocked_by='budget'` 실증.
- `G2 PII unit`: PR#3 → 주민번호/전화/이메일/카드 각 5건 unit 100% pass.
- `G3 review_queue`: PR#3 → SECRET 키워드 문서 1건 → `review_queue` 1행 + sensitivity 승급.
- `G4 tenant leakage`: PR#9 → workspace A/B seed에서 B chunk top-50 0건.
- `G5 schema drift`: PR#4 → `--ci`에서 exit 1 실증.
- `G6 eval fixture`: PR#6 → 30쌍 error 0건 + baseline 3종 기록.
- `G7 로그 완전성`: PR#1 → 실호출 수 = `llm_call_log` row 수(누락 0).

## 3. 7B · Phase-8로 이관된 항목

| 항목 | Phase-6 출처 | 이관 사유 | 이관 대상 |
|---|---|---|---|
| `knowledge_claim` / `document_chunks` dual-read / cutover 절차 | drift 감사 중 표면화 | 7A는 DDL만, 운영 데이터 이동은 7B 이후에 별도 판단이 필요 | 7B (조건부) |
| precedent_case 재임베딩(벡터 공간 통일) | Debt Radar — "두 1536d 벡터가 같은 공간이 아님" 경고 | 교체/hybrid/현상유지 셋 중 결정하려면 eval baseline이 있어야 함 → 7A 인프라 선행 | Phase-8 (M1) |
| editor 교체 | Debt Radar — 에디터 의존성 부채 | 7A/7B와 결합도 낮음, 별도 decision doc 필요 | Phase-8 |
| query-time graph lane | Debt Radar — graphify 결과를 검색에 쓰려는 요구 | LLM 경로와 인터랙션이 복잡, 7B 이후 decision 필요 | Phase-8 |
| TSVD999 `higherCategory × requestCompany` 트리 승격 | Phase-6 후속 별도 트랙 요청 | 7A 본체 스코프 아님. 권한·희소성 선결 필요 | 별도 트랙 (M2) |

## 4. 재검증 리듬

- 각 PR 머지 시 본 표의 `Phase-7 해소` 열 PR 링크를 실 PR URL로 갱신(PR#G 직전에 일괄 정리도 허용).
- PR#G(게이트 판정) 문서 `docs/analysis/07-gate-result-2026-04.md`에서 본 매핑표를 레퍼런스로 인용한다.
- Phase-6 레지스터가 업데이트되면(신규 탐지 추가) 본 표 하단에 "신규 — 해소 미정" 행을 추가한다.

## 5. Revision log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-04-14 | 초안 작성 | Phase-7 v3 spec §5.1에 따라 Lane C PR#8에서 생성 |
```

### 4.2 `packages/search/README.md`

- [ ] 4.2.1 신규 파일 생성, 아래 **전문**을 그대로 쓴다(약 70 lines).

```markdown
# @jarvis/search

Jarvis의 검색 진입점 패키지. **두 개의 독립된 검색 레인**을 지원하며, 이 둘은 **서로 섞이지 않는다**.

## 검색 레인

### Lane A — `document_chunks`

- **대상**: 위키(`knowledge_page`, `wiki_*`) 및 일반 문서 chunk.
- **임베딩**: OpenAI 1536d(`text-embedding-3-small` 또는 후속 모델).
- **쿼리 경로**: Phase-7B 이후 hybrid 검색 (BM25 + 벡터 + freshness + sensitivity-scoped RRF).
- **테이블**: `document_chunks` (Phase-7A PR#7에서 DDL 생성).
- **write path**: `FEATURE_DOCUMENT_CHUNKS_WRITE` 플래그. 7A 기본 off.

### Lane B — `precedent_case`

- **대상**: CS 티켓/판례/선례 케이스(TSVD999 원천 포함).
- **임베딩**: TF-IDF + Truncated SVD로 **별도 1536d 공간**에 투영(OpenAI 공간이 아님).
- **쿼리 경로**: precedent 전용 API. Lane A 쿼리와 **UNION 금지**.
- **테이블**: `precedent_case` + 관련 cluster 테이블.

## ⚠️ 절대 금지

1. **두 레인의 UNION / shared index**
   두 벡터 모두 1536d이지만, 같은 공간이 아니다. 하나의 인덱스에 INSERT 하거나 쿼리 시 UNION으로 합치면 코사인 유사도는 **무의미한 숫자**가 된다.

2. **차원 일치 = 공간 호환이라는 오해**
   TF-IDF+SVD 공간은 rare term exact match에 강하고, OpenAI 공간은 paraphrase에 강하다. 차원이 같다고 서로의 벡터를 섞으면 안 된다.

3. **"일단 같이 검색되게 해놓고 나중에 튜닝"**
   Lane 섞임은 되돌리기 어렵다. 클러스터/digest 파이프라인이 잘못된 벡터에 의존하기 시작하면 전체 재처리가 필요해진다. 통합이 필요하다면 먼저 `M1` 결정 문서를 작성한다.

## 통합 로드맵 (참고)

- **현재(7A / 7B)**: 두 레인은 **완전히 분리**. 각자 API / 각자 인덱스.
- **Phase-8 후보**: precedent_case를 OpenAI 공간으로 **재임베딩**하거나 TF-IDF ↔ OpenAI **hybrid 2채널**로 진화할 수 있음.
  - 전제: 7A eval 인프라(PR#6, G6)로 baseline 측정 완료.
  - 산출물: `docs/analysis/08-precedent-reembedding-decision.md` (작성 전). 결정 근거, 교체 vs hybrid vs 현상 유지 비교.
  - 자세한 배경: `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §7 M1.

## Revision log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-04-14 | 초안 | Phase-7 v3 spec §5.2에 따라 Lane C PR#8에서 생성 |
```

### 4.3 링크 스모크

- [ ] 4.3.1 `docs/analysis/06-phase6-phase7-mapping.md`의 모든 상대 링크(`docs/superpowers/specs/2026-04-14-phase7-v3-design.md` 등)가 실제 파일을 가리키는지 `ls`로 확인.
- [ ] 4.3.2 `packages/search/README.md`의 spec 링크(`§7 M1`) 동일 확인.

### 4.4 PR#8 커밋 & 푸시

- [ ] 4.4.1 스테이지: 위 2개 파일만.
- [ ] 4.4.2 커밋:
  ```
  docs(phase7): Phase-6↔7 매핑 + @jarvis/search separate-lane README

  - docs/analysis/06-phase6-phase7-mapping.md: 8행 매핑표 + 이관 항목 + revision log
  - packages/search/README.md: Lane A(document_chunks, OpenAI 1536d) vs Lane B(precedent_case, TF-IDF+SVD 1536d) 분리 경고
  - Phase-7 v3 spec §5.1/§5.2 충족
  ```
- [ ] 4.4.3 `git push`.

---

## 5. PR 생성 (3 separate PRs)

Spec은 "PR이 분리 가능해야 함"을 요구하지만, Lane C는 같은 브랜치에서 세 개의 논리 단위를 연속 커밋으로 쌓았다. **선택 A**: 브랜치 하나 + PR 하나(혼합). **선택 B**: 커밋을 논리 단위별로 cherry-pick해 3개의 PR. 본 plan은 **선택 B**(spec 방향)를 권장한다.

### 5.1 옵션 A — 통합 PR(빠른 경로, 리뷰어 OK일 때)

- [ ] 5.1.1 `gh pr create` (base=main, head=claude/phase7a-lane-c-schema-docs)
  - Title: `Phase-7A Lane C: schema-drift hook + document_chunks DDL + docs`
  - Body: 세 PR의 요약을 섹션으로 나눠 기술(PR#4/PR#7/PR#8).
  - Reviewers: 사용자 선택.

### 5.2 옵션 B — 3개 PR 분리 (권장)

- [ ] 5.2.1 현재 브랜치에서 3개 논리 커밋이 차례대로 쌓여 있음을 확인(`git log --oneline main..HEAD`).
- [ ] 5.2.2 PR#4 브랜치 파생:
  ```
  git switch -c claude/phase7a-pr4-schema-drift-hook main
  git cherry-pick <PR#4_commit_sha>
  git push -u origin claude/phase7a-pr4-schema-drift-hook
  gh pr create --base main --head claude/phase7a-pr4-schema-drift-hook \
    --title "Phase-7A PR#4: schema-drift hook --ci blocking" \
    --body "G5 게이트(의도적 drift에서 CI 실패) 달성. node:test self-test 포함."
  ```
- [ ] 5.2.3 PR#7 브랜치:
  ```
  git switch -c claude/phase7a-pr7-document-chunks-ddl main
  git cherry-pick <PR#7_commit_sha>
  git push -u origin claude/phase7a-pr7-document-chunks-ddl
  gh pr create --base main --head claude/phase7a-pr7-document-chunks-ddl \
    --title "Phase-7A PR#7: document_chunks DDL (write flag off)" \
    --body "Lane A 테이블 + IVFFlat + writer guard stub. FEATURE_DOCUMENT_CHUNKS_WRITE=false 기본."
  ```
- [ ] 5.2.4 PR#8 브랜치:
  ```
  git switch -c claude/phase7a-pr8-docs main
  git cherry-pick <PR#8_commit_sha>
  git push -u origin claude/phase7a-pr8-docs
  gh pr create --base main --head claude/phase7a-pr8-docs \
    --title "Phase-7A PR#8: Phase-6↔7 매핑 + search README" \
    --body "docs/analysis/06 + packages/search/README.md."
  ```
- [ ] 5.2.5 원본 Lane C 통합 브랜치 `claude/phase7a-lane-c-schema-docs`는 보존(merge 충돌 대비)만 하고 PR은 열지 않음.

---

## 6. 게이트 검증 (로컬에서 가능한 수준)

- [ ] 6.1 **G5 (hook 블로킹)**: `node scripts/check-schema-drift.mjs --ci`를 의도적 drift 상태에서 실행 → exit 1 캡처. 정리 후 재실행 → exit 0. PR#4 PR body에 출력 붙여넣기.
- [ ] 6.2 **PR#7 완료 조건**: `psql -c "\d document_chunks"` 결과를 PR#7 body에 캡처. `writeChunks()` unit test 통과 로그 붙여넣기.
- [ ] 6.3 **PR#8 완료 조건**: 두 파일이 머지 가능한 상태 + 모든 상대 링크가 404 아님.

---

## 7. Rollback / Kill-switch

| 대상 | 롤백 방법 |
|---|---|
| PR#4 | `git revert` 가능. hook이 다시 advisory-only로 되돌아감. CI에서 --ci step이 있으면 제거. |
| PR#7 schema | `pnpm db:rollback` 또는 해당 마이그레이션 파일 제거 + 수동 `DROP TABLE document_chunks`. Write path가 없으므로 데이터 손실 없음. |
| PR#7 flag | `FEATURE_DOCUMENT_CHUNKS_WRITE` 제거. writer stub는 기본이 throw이므로 영향 없음. |
| PR#8 docs | 파일 삭제만. 코드 영향 없음. |

---

## 8. Open questions / 주의

- **DB migrate 명령어**: 리포에 `pnpm db:migrate`가 실제 정의되어 있는지 확인 필요(없으면 Drizzle CLI 직접 호출). 구현자는 `package.json` 스크립트를 먼저 확인할 것.
- **Vitest vs node:test**: `packages/db` 기존 테스트 러너에 맞춰 §3.5.3 테스트 포맷을 조정(리포가 vitest를 쓰면 vitest, 아니면 node:test).
- **`.github/workflows/` 부재**: 확인 후 없으면 Lane D PR#9에 위임한다. Lane C에서 CI yaml을 **새로 만들지 않는다**(스코프 아님).
- **IVFFlat lists 파라미터**: 100은 초기 기본값. 데이터가 적으면 성능에 큰 영향 없음. Phase-8 최적화 시점에 재검토.
- **Drizzle vector customType journal**: `pnpm db:generate`가 vector customType을 snapshot에 반영하는지 버전마다 다름. snapshot에 `embedding` 컬럼이 누락되어 있으면 Drizzle 버전 업그레이드 또는 raw SQL 보조 방식 유지.

---

## 9. Self-Review Checklist

구현 종료 시 본 체크리스트를 PR 설명 또는 커밋 메시지 푸터에 그대로 붙인다.

- [ ] PR#4
  - [ ] `scripts/check-schema-drift.mjs`에 `--ci`, `--precommit` 분기 추가
  - [ ] `--hook` 분기는 여전히 exit 0 (advisory) 유지
  - [ ] `scripts/tests/check-schema-drift.test.mjs` 작성, `node --test`로 PASS
  - [ ] 의도적 drift 실증 로그 PR body에 첨부
  - [ ] CLAUDE.md / AGENTS.md 훅 설명 업데이트
  - [ ] CI yaml 수정은 본 PR에서 하지 않고 Lane D PR#9로 메모 남김
- [ ] PR#7
  - [ ] `packages/db/schema/document-chunks.ts` 존재, customType vector(1536) 패턴 knowledge.ts와 동일
  - [ ] unique(document_type, document_id, chunk_index) + doc/hash/ws 인덱스 3종
  - [ ] FK workspace ON DELETE CASCADE
  - [ ] `pnpm db:generate` 산출 마이그레이션 커밋됨
  - [ ] IVFFlat 보조 SQL 마이그레이션 존재(생성본에 없을 경우)
  - [ ] `packages/db/feature-flags.ts` 혹은 동등 진입점, 기본 false
  - [ ] `packages/db/writers/document-chunks.ts` flag off 시 throw, on + impl 없음 시에도 throw
  - [ ] writer unit test PASS
- [ ] PR#8
  - [ ] `docs/analysis/06-phase6-phase7-mapping.md` 8행 매핑표 + P0/P1/P2 심각도 정의 + 이관 섹션 + revision log
  - [ ] `packages/search/README.md` Lane A / Lane B / 금지 / 로드맵 / revision log 섹션
  - [ ] 모든 상대 링크 404 없음
- [ ] 공통
  - [ ] 브랜치: `claude/phase7a-lane-c-schema-docs` (통합) + 필요 시 3개 파생 브랜치
  - [ ] 커밋 메시지에 "Phase-7A PR#4/PR#7/PR#8" 태그 포함
  - [ ] `node scripts/check-schema-drift.mjs --ci` 최종 상태 exit 0
  - [ ] Self-Review Checklist 전부 체크됨
