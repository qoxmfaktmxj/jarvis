"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";

type Props = {
  rows: CustomerContactRow[];
  total: number;
  page: number;
  limit: number;
};

function makeBlankRow(): CustomerContactRow {
  return {
    id: crypto.randomUUID(),
    custMcd: "",
    customerId: null,
    custName: null,
    jikweeNm: null,
    orgNm: null,
    telNo: null,
    hpNo: null,
    email: null,
    statusYn: true,
    sabun: null,
  };
}

const COLUMNS: ColumnDef<CustomerContactRow>[] = [
  { key: "custMcd", label: "마스터코드", type: "text", width: 130, editable: true, required: true },
  { key: "custName", label: "이름", type: "text", width: 130, editable: true },
  { key: "jikweeNm", label: "직위", type: "text", width: 120, editable: true },
  { key: "orgNm", label: "부서", type: "text", width: 150, editable: true },
  { key: "telNo", label: "전화", type: "text", width: 130, editable: true },
  { key: "hpNo", label: "휴대폰", type: "text", width: 130, editable: true },
  { key: "email", label: "이메일", type: "text", width: 200, editable: true },
  { key: "statusYn", label: "활성", type: "boolean", width: 80, editable: true },
  { key: "sabun", label: "담당사번", type: "text", width: 100, editable: true },
];

const FILTERS: FilterDef<CustomerContactRow>[] = [
  { key: "custMcd", type: "text", placeholder: "마스터코드" },
  { key: "custName", type: "text", placeholder: "이름" },
];

export function CustomerContactsGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCustomerContacts({
          custMcd: nextFilters.custMcd || undefined,
          custName: nextFilters.custName || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerContactRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  return (
    <DataGrid<CustomerContactRow>
      rows={rows}
      total={total}
      columns={COLUMNS}
      filters={FILTERS}
      page={page}
      limit={limit}
      makeBlankRow={makeBlankRow}
      filterValues={filterValues}
      onPageChange={(p) => reload(p, filterValues)}
      onFilterChange={(f) => reload(1, f)}
      onSave={async (changes) => {
        const result = await saveCustomerContacts(changes);
        if (result.ok) await reload(page, filterValues);
        return result;
      }}
    />
  );
}
