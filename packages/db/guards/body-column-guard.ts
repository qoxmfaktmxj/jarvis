/**
 * packages/db/guards/body-column-guard.ts
 *
 * Phase-W1 T4 — G11 Legacy body column READ guard
 * (docs/analysis/99-integration-plan-v4.md §5.1 G11).
 *
 * **목적**
 * Karpathy-first 피벗 이후 wiki 본문의 SSoT는 디스크(`wiki/{workspaceId}/**.md`) + git이다.
 * 레거시 테이블의 본문 컬럼이 다시 SSoT처럼 읽히면 MindVault 함정(DB-backed wiki skin)이
 * 재발한다. 이 가드가 그 경로를 application layer에서 차단한다.
 *
 * **차단 대상 (table, column) 조합**
 *   - knowledge_page.mdxContent   (구 Phase-7B 정본 위키 본문)
 *   - wiki_sources.body           (구 wiki_sources 본문)
 *   - wiki_concepts.body          (구 wiki_concepts 본문)
 *
 * **활성 조건**
 *   - `FEATURE_WIKI_FS_MODE=true` 일 때만 throw. false/unset이면 no-op 통과.
 *     (Phase-W0~W1 롤아웃 중 기존 코드가 읽기를 당장 멈출 수 없는 경우를 위해 flag gating.)
 *
 * **동반 게이트 (G11)**
 * CI에서 `.github/workflows/legacy-body-grep.yml`이 정적 검사(grep)로 신규 코드 진입도 차단.
 * 이 런타임 가드는 "의도치 않은 경로로 읽히는 것"을 잡는 방어의 두 번째 라인.
 *
 * **사용 패턴**
 * ```ts
 * import { assertNotBodyColumn, wrapQuery } from "@jarvis/db/guards/body-column-guard";
 *
 * // 직접 assert
 * assertNotBodyColumn("knowledge_page", ["id", "title", "mdxContent"]); // throws
 *
 * // Drizzle select builder를 wrap 해서 실행 직전 검증
 * const rows = await wrapQuery(
 *   () => db.select({ id: knowledgePage.id, title: knowledgePage.title }).from(knowledgePage),
 *   { table: "knowledge_page", columns: ["id", "title"] }
 * );
 * ```
 */

export class BodyColumnReadGuardError extends Error {
  public readonly table: string;
  public readonly violatingColumns: readonly string[];

  constructor(table: string, violatingColumns: readonly string[]) {
    super(
      `[G11] Forbidden legacy body column read in FEATURE_WIKI_FS_MODE: ` +
        `${table}.{${violatingColumns.join(", ")}}. ` +
        `Wiki 본문 SSoT는 디스크(wiki/{workspaceId}/**.md)입니다. ` +
        `packages/wiki-fs 경유로 읽으세요. ` +
        `(docs/analysis/99-integration-plan-v4.md §5.1 G11)`,
    );
    this.name = "BodyColumnReadGuardError";
    this.table = table;
    this.violatingColumns = violatingColumns;
  }
}

/**
 * (table, column) 차단 맵. lowercase key로 정규화.
 * 테이블 별칭(e.g. knowledgePage)과 raw DB 이름(knowledge_page) 모두 매칭 가능하도록 두 형태 저장.
 */
const FORBIDDEN_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
  knowledge_page: new Set(["mdxcontent", "mdx_content"]),
  knowledgepage: new Set(["mdxcontent", "mdx_content"]),
  wiki_sources: new Set(["body"]),
  wikisources: new Set(["body"]),
  wiki_concepts: new Set(["body"]),
  wikiconcepts: new Set(["body"]),
};

function normalizeTableName(table: string): string {
  return table.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function normalizeColumnName(col: string): string {
  return col.trim().toLowerCase();
}

export function isBodyColumnGuardActive(): boolean {
  return process.env["FEATURE_WIKI_FS_MODE"] === "true";
}

/**
 * 주어진 (table, columns)가 금지된 조합이면 BodyColumnReadGuardError를 throw.
 * FEATURE_WIKI_FS_MODE가 켜져 있지 않으면 조용히 통과.
 */
export function assertNotBodyColumn(
  table: string,
  columns: readonly string[],
): void {
  if (!isBodyColumnGuardActive()) return;

  const forbidden = FORBIDDEN_COLUMNS[normalizeTableName(table)];
  if (!forbidden || forbidden.size === 0) return;

  const hits: string[] = [];
  for (const col of columns) {
    const norm = normalizeColumnName(col);
    if (forbidden.has(norm)) {
      hits.push(col);
    }
  }

  if (hits.length > 0) {
    throw new BodyColumnReadGuardError(table, hits);
  }
}

export interface BodyColumnGuardMeta {
  table: string;
  columns: readonly string[];
}

/**
 * Drizzle (또는 임의) query 실행 함수를 감싸 실행 직전 assert.
 *
 * 비동기·동기 모두 지원. 반환값은 래핑된 함수의 반환값 그대로.
 *
 * @example
 *   const rows = await wrapQuery(
 *     () => db.select({ id: knowledgePage.id }).from(knowledgePage),
 *     { table: "knowledge_page", columns: ["id"] },
 *   );
 */
export function wrapQuery<T>(
  fn: () => T,
  meta: BodyColumnGuardMeta,
): T {
  assertNotBodyColumn(meta.table, meta.columns);
  return fn();
}
