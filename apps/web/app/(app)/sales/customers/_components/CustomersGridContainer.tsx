"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv-export";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomers, saveCustomers } from "../actions";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";

type Option = { value: string; label: string };

type FilterDefaults = {
  custNm: string;
  custKindCd: string;
  custDivCd: string;
  chargerNm: string;
};

type Props = {
  rows: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: Partial<FilterDefaults>;
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
  const t = useTranslations("Sales");
  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [, startTransition] = useTransition();

  // URL-synced filter state (replaces local useState filterValues).
  // useUrlFilters keeps searchParams in sync so page.tsx re-runs on navigation,
  // providing SSR-rendered initial rows (parity with legacy ibSheet searchXxx map).
  const FILTER_DEFAULTS: FilterDefaults = {
    custNm: initialFilters?.custNm ?? "",
    custKindCd: initialFilters?.custKindCd ?? "",
    custDivCd: initialFilters?.custDivCd ?? "",
    chargerNm: initialFilters?.chargerNm ?? "",
  };

  const { values, setValue } = useUrlFilters<FilterDefaults>({ defaults: FILTER_DEFAULTS });

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterDefaults) => {
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

  // DataGrid built-in FilterDef — custNm / custKindCd / custDivCd remain in DataGrid's
  // internal filter bar (they share URL state via useUrlFilters values).
  // chargerNm is a new field not in legacy ibSheet filter bar spec; rendered manually below.
  const FILTERS: FilterDef<CustomerRow>[] = [
    { key: "custNm", type: "text", placeholder: "고객명" },
    { key: "custKindCd", type: "select", options: codeOptions.custKind },
    { key: "custDivCd", type: "select", options: codeOptions.custDiv },
  ];

  // CSV export: Hidden:0 columns only (mirrors COLUMNS above).
  const handleExport = () => {
    const csv = rowsToCsv(rows, [
      { key: "custNm", header: "고객명" },
      { key: "custKindCd", header: "고객종류" },
      { key: "custDivCd", header: "고객구분" },
      { key: "ceoNm", header: "대표자" },
      { key: "telNo", header: "전화번호" },
      { key: "createdAt", header: "등록일자" },
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `customers_${date}.csv`);
  };

  return (
    <>
      {/* chargerNm filter strip — separate from DataGrid's built-in filter bar.
          Placed above DataGridToolbar so it appears logically as "extra search criteria"
          before the export button row (separate strips pattern). */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <input
          type="text"
          placeholder={t("Customers.search.chargerNm")}
          value={values.chargerNm}
          onChange={(e) => {
            setValue("chargerNm", e.target.value);
            reload(1, { ...values, chargerNm: e.target.value });
          }}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </div>

      {/* DataGridToolbar (separate strip above DataGrid — per baseline JSDoc pattern). */}
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={t("Common.Excel.label")}
      />

      <DataGrid<CustomerRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={values}
        onPageChange={(p) => reload(p, values)}
        onFilterChange={(f) => {
          const next: FilterDefaults = {
            custNm: (f.custNm as string | undefined) ?? "",
            custKindCd: (f.custKindCd as string | undefined) ?? "",
            custDivCd: (f.custDivCd as string | undefined) ?? "",
            chargerNm: values.chargerNm,
          };
          // Sync changed keys to URL via useUrlFilters.
          if (next.custNm !== values.custNm) setValue("custNm", next.custNm);
          if (next.custKindCd !== values.custKindCd) setValue("custKindCd", next.custKindCd);
          if (next.custDivCd !== values.custDivCd) setValue("custDivCd", next.custDivCd);
          reload(1, next);
        }}
        onSave={async (changes) => {
          const result = await saveCustomers(changes);
          if (result.ok) {
            await reload(page, values);
          }
          return result;
        }}
      />
    </>
  );
}
