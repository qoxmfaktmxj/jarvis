"use server";
/**
 * apps/web/app/(app)/sales/mail-persons/export.ts
 *
 * Server-side Excel export for the 메일담당자 grid.
 * Returns a Uint8Array (xlsx bytes) + filename for `triggerDownload`.
 *
 * Filename convention: mail-persons_YYYY-MM-DD.xlsx
 * Sheet name: 메일담당자
 */
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import { exportMailPersonsRows } from "./actions";
import type {
  MailPersonRow,
  exportMailPersonsInput,
} from "@jarvis/shared/validation/sales/mail-person";
import type { z } from "zod";

const MAX_EXPORT_ROWS = 50_000;

/** Visible columns for export — matches Hidden:0 ibsheet columns (sabun included per legacy JSP). */
const EXPORT_COLUMNS: ColumnDef<MailPersonRow>[] = [
  { key: "sabun", label: "사번", type: "text" },
  { key: "name", label: "이름", type: "text" },
  { key: "mailId", label: "메일 ID", type: "text" },
  { key: "salesYn", label: "영업", type: "boolean" },
  { key: "insaYn", label: "인사", type: "boolean" },
  { key: "memo", label: "메모", type: "text" },
  { key: "createdAt", label: "등록일자", type: "readonly" },
];

export async function exportMailPersonsToExcel(
  rawInput: z.input<typeof exportMailPersonsInput>,
): Promise<{ ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string }> {
  const result = await exportMailPersonsRows(rawInput);
  if (!result.ok) return { ok: false, error: "error" in result ? String(result.error) : "export failed" };

  if (result.rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `mail-persons_${date}.xlsx`;

  const buf = await exportToExcel({
    rows: result.rows as MailPersonRow[],
    columns: EXPORT_COLUMNS,
    sheetName: "메일담당자",
  });

  return { ok: true, bytes: new Uint8Array(buf), filename };
}
