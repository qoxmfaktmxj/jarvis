/**
 * CSV-injection neutralization for spreadsheet cell values. Cells
 * starting with =, +, -, @, \t, or \r are interpreted as formulas
 * by Excel/Sheets. Prepend single quote to neutralize.
 *
 * Mirrors server-side pattern in apps/web/app/api/admin/users/export/route.ts.
 *
 * Use in cellFormatter callback when calling exportToExcel:
 *   cellFormatter: (row, col) => sanitizeCellValue(row[col.key])
 */
export function sanitizeCellValue(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = typeof v === "string" ? v : String(v);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}
