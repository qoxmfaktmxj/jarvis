import * as XLSX from "xlsx";
import type { ColumnDef } from "@/components/grid/types";

/**
 * Excel filename convention: callers compose the filename via
 *   t('Sales.Common.Excel.filename', { screen: <localized title>, date: 'YYYY-MM-DD' })
 * The {screen} placeholder receives the localized screen title (e.g.
 * t('Sales.Customers.title')) so filenames are user-locale consistent.
 * The {date} placeholder receives ISO date (YYYY-MM-DD).
 */

export type ExportArgs<T> = {
  rows: T[];
  /**
   * Columns to include in the exported sheet, in order.
   *
   * Each `column.label` MUST be the display string (post-`t()` translation),
   * NOT an i18n key. This matches the convention used by DataGrid, which also
   * renders `col.label` directly after callers resolve translations beforehand.
   *
   * Column filtering (hidden columns, etc.) is the caller's responsibility —
   * pass only the columns you want exported. See the "Phase 2 caller pattern"
   * note on {@link exportToExcel}.
   */
  columns: ColumnDef<T>[];
  sheetName: string;
};

/**
 * Converts `rows` + `columns` into an `.xlsx` Buffer suitable for download.
 *
 * **label contract:** `column.label` must be a resolved display string
 * (i.e. the caller has already called `t(...)` / passed a Korean/English string
 * directly). Passing raw i18n key suffixes will produce broken Excel headers.
 * This is the same convention as DataGrid's header rendering.
 *
 * **Phase 2 caller pattern (hidden-column filtering):**
 * `ColumnDef` has no `hidden` field. If a screen has columns it doesn't want
 * exported, exclude them from the array *before* calling this function:
 * ```ts
 * const exportColumns = COLUMNS.filter((c) => c.key !== "internalNote");
 * const buf = await exportToExcel({ rows, columns: exportColumns, sheetName });
 * ```
 * Legacy ibsheet semantics: the visible grid columns ARE the exported columns.
 *
 * `async` to match server-action calling convention (Phase 2 export.ts files
 * all await this). Internal logic is synchronous — XLSX.write is synchronous
 * in Node.
 */
export async function exportToExcel<T extends Record<string, unknown>>({
  rows,
  columns,
  sheetName,
}: ExportArgs<T>): Promise<Buffer> {
  const header = columns.map((c) => c.label);
  const data = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      // TODO: if a Date is passed (no current Phase 2 row type uses Date),
      // produce an Excel date cell via XLSX.SSF.format / cell type 'd' instead of String(v).
      return String(v);
    }),
  );
  const aoa = [header, ...data];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const out = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/**
 * Single source of truth for the per-export row cap across every grid.
 *
 * 200,000 picked for the self-hosted Linux server: well below the xlsx
 * sheet limit (1,048,576), comfortable inside Node's default heap, and
 * roughly 5–20MB output xlsx for typical column counts. If you bump this,
 * sanity-check peak memory under the heaviest column count first.
 *
 * Beyond this, users are asked to narrow filters and export in slices —
 * not because Excel can't hold it, but because returning a 50MB+ xlsx
 * over a sync server action becomes a UX/timeout liability.
 */
export const EXPORT_ROW_LIMIT = 200_000;

/**
 * Guard helper used by every export.ts. Use the (LIMIT + 1) query pattern:
 *
 *   const rowsWithSentinel = await db.select()...limit(EXPORT_ROW_LIMIT + 1);
 *   const guard = enforceExportLimit(rowsWithSentinel);
 *   if (!guard.ok) return { ok: false, error: guard.error };
 *   const exportRows = guard.rows.map(serialize);
 *
 * Treats the query result of (LIMIT + 1) as the overflow sentinel: if the
 * caller got back N+1 rows, there are at least N+1 matches and we refuse.
 * The accepted result is sliced to LIMIT defensively.
 *
 * Returns a localized Korean error string (Jarvis is a Korean internal tool;
 * server actions don't currently set up next-intl context, and this message
 * propagates to client toasts via { error: string } shape used by every
 * grid's onExport handler).
 */
export function enforceExportLimit<T>(
  rowsWithSentinel: T[],
): { ok: true; rows: T[] } | { ok: false; error: string } {
  if (rowsWithSentinel.length > EXPORT_ROW_LIMIT) {
    return { ok: false, error: exportLimitExceededError() };
  }
  return { ok: true, rows: rowsWithSentinel.slice(0, EXPORT_ROW_LIMIT) };
}

/**
 * Standardized Korean error message for the export row cap. Exported in case
 * a caller needs to format it before delegating to {@link enforceExportLimit}.
 */
export function exportLimitExceededError(): string {
  const max = EXPORT_ROW_LIMIT.toLocaleString("ko-KR");
  return `${max}건을 초과합니다. 한 번에 다운로드 가능한 최대 건수입니다. 필터를 좁혀 나눠 다운로드해 주세요.`;
}
