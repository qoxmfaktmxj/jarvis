import * as XLSX from "xlsx";
import type { ColumnDef } from "@/components/grid/types";

export type ExportArgs<T> = {
  rows: T[];
  columns: ColumnDef<T>[];
  sheetName: string;
};

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
