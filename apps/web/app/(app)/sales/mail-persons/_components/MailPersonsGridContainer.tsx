"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listMailPersons, saveMailPersons } from "../actions";
import type { MailPersonRow } from "@jarvis/shared/validation/sales/mail-person";

type Props = { rows: MailPersonRow[]; total: number; page: number; limit: number };

function makeBlankRow(): MailPersonRow {
  // Legacy ibSheet bizMailPersonMgr.jsp:26~35 marks `sabun` Hidden:1 (PK, not user-input here).
  // Derive a placeholder sabun from the row id so the NOT NULL + (workspace, sabun) UNIQUE
  // constraint is satisfied until an HR-employee popup is wired up (Task 11+ scope).
  // createdAt is omitted on new rows — DB defaultNow assigns on save; UI shows "—".
  const id = crypto.randomUUID();
  return {
    id,
    sabun: id.slice(0, 12),
    name: "",
    mailId: "",
    salesYn: false,
    insaYn: false,
    memo: null,
    createdAt: null,
  };
}

// Hidden:0 (visible) columns per legacy ibSheet bizMailPersonMgr.jsp:26~35.
// `sabun` is Hidden:1 (PK) — intentionally omitted from grid columns.
const COLUMNS: ColumnDef<MailPersonRow>[] = [
  { key: "name", label: "이름", type: "text", width: 140, editable: true, required: true },
  { key: "mailId", label: "메일 ID", type: "text", width: 220, editable: true, required: true },
  { key: "salesYn", label: "영업", type: "boolean", width: 70, editable: true },
  { key: "insaYn", label: "인사", type: "boolean", width: 70, editable: true },
  { key: "memo", label: "메모", type: "text", editable: true },
  {
    key: "createdAt",
    label: "등록일자",
    type: "readonly",
    width: 110,
    render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
  },
];

const FILTERS: FilterDef<MailPersonRow>[] = [
  { key: "name", type: "text", placeholder: "이름" },
];

export function MailPersonsGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const [rows, setRows] = useState<MailPersonRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listMailPersons({ name: nextFilters.name || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as MailPersonRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  return (
    <DataGrid<MailPersonRow>
      rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
      page={page} limit={limit} makeBlankRow={makeBlankRow} filterValues={filterValues}
      onPageChange={(p) => reload(p, filterValues)}
      onFilterChange={(f) => reload(1, f)}
      onSave={async (changes) => { const result = await saveMailPersons(changes); if (result.ok) await reload(page, filterValues); return result; }}
    />
  );
}
