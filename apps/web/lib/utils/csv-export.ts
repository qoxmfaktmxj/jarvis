export type CsvColumn<T> = {
  key: keyof T;
  header: string;
};

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // CSV-injection neutralization (OWASP). Mirrors server-side exporter
  // at apps/web/app/api/admin/users/export/route.ts:21.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  const head = columns.map((c) => escape(c.header)).join(",");
  if (rows.length === 0) return head;
  const body = rows
    .map((r) => columns.map((c) => escape(r[c.key])).join(","))
    .join("\r\n");
  return `${head}\r\n${body}`;
}

export function downloadCsv(csv: string, filename: string): void {
  // BOM for Excel UTF-8 compatibility (Korean)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
