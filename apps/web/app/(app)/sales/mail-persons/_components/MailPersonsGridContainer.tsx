"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listMailPersons, saveMailPersons } from "../actions";
import type { MailPersonRow } from "@jarvis/shared/validation/sales/mail-person";

type Props = { rows: MailPersonRow[]; total: number; page: number; limit: number };

function makeBlankRow(): MailPersonRow {
  return { id: crypto.randomUUID(), sabun: "", name: "", salesYn: false, insaYn: false };
}

const COLUMNS: ColumnDef<MailPersonRow>[] = [
  { key: "sabun", label: "사번", type: "text", width: 100, editable: true, required: true },
  { key: "name", label: "이름", type: "text", width: 150, editable: true, required: true },
  { key: "salesYn", label: "영업", type: "boolean", width: 80, editable: true },
  { key: "insaYn", label: "인사", type: "boolean", width: 80, editable: true },
];

const FILTERS: FilterDef<MailPersonRow>[] = [
  { key: "sabun", type: "text", placeholder: "사번" },
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
      const res = await listMailPersons({ sabun: nextFilters.sabun || undefined, name: nextFilters.name || undefined, page: nextPage, limit });
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
