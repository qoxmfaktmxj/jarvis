"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { sanitizeCellValue } from "@/lib/utils/sanitize-csv";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomers, saveCustomers } from "../actions";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";

type Option = { value: string; label: string };

type Props = {
  rows: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: Record<string, string>;
  codeOptions: {
    custKind: Option[];
    custDiv: Option[];
    exchangeType: Option[];
  };
};

function makeBlankRow(): CustomerRow {
  // Legacy ibSheet bizActCustCompanyMgr.jsp:221~233 marks `custCd` Hidden:1 (PK, system-assigned).
  // Until a code-generation popup is wired up, derive a placeholder from the row id so the
  // NOT NULL + (workspace, custCd) UNIQUE constraint is satisfied. createdAt is omitted on
  // new rows — DB defaultNow assigns on save; UI shows "—".
  const id = crypto.randomUUID();
  return {
    id,
    custCd: id.slice(0, 12),
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
    createdAt: null,
  };
}

export function CustomersGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters,
  codeOptions,
}: Props) {
  const tCommon = useTranslations();
  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters ?? {});
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCustomers({
          custNm: nextFilters.custNm || undefined,
          custKindCd: nextFilters.custKindCd || undefined,
          custDivCd: nextFilters.custDivCd || undefined,
          chargerNm: nextFilters.chargerNm || undefined,
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

  // Hidden:0 (visible) columns per legacy ibSheet bizActCustCompanyMgr.jsp:221~233.
  // custCd / businessNo / businessKind / homepage / addr1 are Hidden:1 — intentionally omitted.
  const COLUMNS: ColumnDef<CustomerRow>[] = [
    { key: "custNm", label: "고객명", type: "text", editable: true, required: true },
    { key: "custKindCd", label: "고객종류", type: "select", width: 120, editable: true, options: codeOptions.custKind },
    { key: "custDivCd", label: "고객구분", type: "select", width: 120, editable: true, options: codeOptions.custDiv },
    { key: "ceoNm", label: "대표자", type: "text", width: 150, editable: true },
    { key: "telNo", label: "전화번호", type: "text", width: 130, editable: true },
    {
      key: "createdAt",
      label: "등록일자",
      type: "readonly",
      width: 110,
      render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
    },
  ];

  const FILTERS: FilterDef<CustomerRow>[] = [
    { key: "custNm", type: "text", placeholder: "고객명" },
    { key: "custKindCd", type: "select", options: codeOptions.custKind },
    { key: "custDivCd", type: "select", options: codeOptions.custDiv },
    // chargerNm is filter-only (EXISTS subquery on salesCustomerCharger — not a CustomerRow column)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "chargerNm" as any, type: "text", placeholder: tCommon("Sales.Customers.search.chargerNm") },
  ];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: typeof c.label === "string" ? c.label : c.key,
      }));
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await exportToExcel({
        filename: `customers_${date}`,
        sheetName: "고객사",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          // counts column (angry-ishizaka follow-on) skip
          if (col.key === "counts") return "";
          return sanitizeCellValue((row as Record<string, unknown>)[col.key]);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={tCommon("Sales.Common.Excel.label")}
        isExporting={isExporting}
      />
      <DataGrid<CustomerRow>
        syncWithUrl
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
    </>
  );
}
