import * as XLSX from "xlsx";
import type { ColumnDef } from "@/components/grid/types";

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
