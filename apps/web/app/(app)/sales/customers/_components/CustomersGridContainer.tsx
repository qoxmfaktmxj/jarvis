"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomers, saveCustomers } from "../actions";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";

type Option = { value: string; label: string };

type Props = {
  rows: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  codeOptions: {
    custKind: Option[];
    custDiv: Option[];
    exchangeType: Option[];
  };
};

function makeBlankRow(): CustomerRow {
  return {
    id: crypto.randomUUID(),
    custCd: "",
    custNm: "",
    custKindCd: null,
    custDivCd: null,
    exchangeTypeCd: null,
    custSourceCd: null,
    custImprCd: null,
    buyInfoCd: null,
    buyInfoDtCd: null,
    ceoNm: null,
    telNo: null,
    businessNo: null,
    faxNo: null,
    businessKind: null,
    homepage: null,
    addrNo: null,
    addr1: null,
    addr2: null,
  };
}

export function CustomersGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  codeOptions,
}: Props) {
  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCustomers({
          custCd: nextFilters.custCd || undefined,
          custNm: nextFilters.custNm || undefined,
          custKindCd: nextFilters.custKindCd || undefined,
          custDivCd: nextFilters.custDivCd || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  const COLUMNS: ColumnDef<CustomerRow>[] = [
    { key: "custCd", label: "고객코드", type: "text", width: 100, editable: true, required: true },
    { key: "custNm", label: "고객명", type: "text", editable: true, required: true },
    { key: "ceoNm", label: "대표자", type: "text", width: 150, editable: true },
    { key: "businessNo", label: "사업자번호", type: "text", width: 130, editable: true },
    { key: "telNo", label: "전화번호", type: "text", width: 130, editable: true },
    { key: "custKindCd", label: "고객종류", type: "select", width: 120, editable: true, options: codeOptions.custKind },
    { key: "custDivCd", label: "고객구분", type: "select", width: 120, editable: true, options: codeOptions.custDiv },
    { key: "exchangeTypeCd", label: "거래유형", type: "select", width: 120, editable: true, options: codeOptions.exchangeType },
    { key: "businessKind", label: "업종", type: "text", width: 200, editable: true },
    { key: "homepage", label: "홈페이지", type: "text", width: 200, editable: true },
    { key: "addr1", label: "주소", type: "text", width: 300, editable: true },
  ];

  const FILTERS: FilterDef<CustomerRow>[] = [
    { key: "custCd", type: "text", placeholder: "고객코드" },
    { key: "custNm", type: "text", placeholder: "고객명" },
    { key: "custKindCd", type: "select", options: codeOptions.custKind },
    { key: "custDivCd", type: "select", options: codeOptions.custDiv },
  ];

  return (
    <DataGrid<CustomerRow>
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
        const result = await saveCustomers(changes);
        if (result.ok) {
          await reload(page, filterValues);
        }
        return result;
      }}
    />
  );
}
