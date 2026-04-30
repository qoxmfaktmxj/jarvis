"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listLicenses, saveLicenses } from "../actions";
import type { LicenseRow } from "@jarvis/shared/validation/sales/license";

type Option = { value: string; label: string };
type Props = { rows: LicenseRow[]; total: number; page: number; limit: number; licenseKindOptions: Option[] };

function makeBlankRow(): LicenseRow {
  return { id: crypto.randomUUID(), licenseNo: "", customerId: null, productCd: null, licenseKindCd: null, sdate: null, edate: null, qty: null, remark: null };
}

export function LicensesGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit, licenseKindOptions }: Props) {
  const [rows, setRows] = useState<LicenseRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listLicenses({ licenseNo: nextFilters.licenseNo || undefined, licenseKindCd: nextFilters.licenseKindCd || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as LicenseRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  const COLUMNS: ColumnDef<LicenseRow>[] = [
    { key: "licenseNo", label: "라이센스 번호", type: "text", width: 160, editable: true, required: true },
    { key: "productCd", label: "제품코드", type: "text", width: 120, editable: true },
    { key: "licenseKindCd", label: "라이센스 종류", type: "select", width: 140, editable: true, options: licenseKindOptions },
    { key: "sdate", label: "시작일", type: "date", width: 130, editable: true },
    { key: "edate", label: "종료일", type: "date", width: 130, editable: true },
    { key: "qty", label: "수량", type: "readonly", width: 80 },
    { key: "remark", label: "비고", type: "text", editable: true },
  ];

  const FILTERS: FilterDef<LicenseRow>[] = [
    { key: "licenseNo", type: "text", placeholder: "라이센스 번호" },
    { key: "licenseKindCd", type: "select", options: licenseKindOptions },
  ];

  return (
    <DataGrid<LicenseRow>
      rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
      page={page} limit={limit} makeBlankRow={makeBlankRow} filterValues={filterValues}
      onPageChange={(p) => reload(p, filterValues)}
      onFilterChange={(f) => reload(1, f)}
      onSave={async (changes) => { const result = await saveLicenses(changes); if (result.ok) await reload(page, filterValues); return result; }}
    />
  );
}
