"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv-export";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listProductTypes, saveProductTypes } from "../actions";
import type { ProductTypeRow } from "@jarvis/shared/validation/sales/product-type";

type FilterDefaults = {
  productCd: string;
  productNm: string;
};

type Props = {
  rows: ProductTypeRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: Partial<FilterDefaults>;
};

function makeBlankRow(): ProductTypeRow {
  // createdAt is omitted on new rows — DB defaultNow assigns on save; UI shows "—".
  return { id: crypto.randomUUID(), productCd: "", productNm: "", createdAt: null };
}

const COLUMNS: ColumnDef<ProductTypeRow>[] = [
  { key: "productCd", label: "제품코드", type: "text", width: 120, editable: true, required: true },
  { key: "productNm", label: "제품명", type: "text", editable: true, required: true },
  {
    key: "createdAt",
    label: "등록일자",
    type: "readonly",
    width: 110,
    render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
  },
];

const FILTERS: FilterDef<ProductTypeRow>[] = [
  { key: "productCd", type: "text", placeholder: "제품코드" },
  { key: "productNm", type: "text", placeholder: "제품명" },
];

export function ProductTypesGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters,
}: Props) {
  const t = useTranslations("Sales");
  const [rows, setRows] = useState<ProductTypeRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [, startTransition] = useTransition();

  // URL-synced filter state (replaces local useState filterValues).
  // useUrlFilters keeps searchParams in sync so page.tsx re-runs on navigation,
  // providing SSR-rendered initial rows (parity with legacy ibSheet searchXxx map).
  const FILTER_DEFAULTS: FilterDefaults = useMemo(
    () => ({
      productCd: initialFilters?.productCd ?? "",
      productNm: initialFilters?.productNm ?? "",
    }),
    [initialFilters?.productCd, initialFilters?.productNm],
  );

  const { values, setValue } = useUrlFilters<FilterDefaults>({ defaults: FILTER_DEFAULTS });

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterDefaults) => {
      startTransition(async () => {
        const res = await listProductTypes({
          productCd: nextFilters.productCd || undefined,
          productNm: nextFilters.productNm || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as ProductTypeRow[]);
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    [limit],
  );

  // CSV export: Hidden:0 columns only (mirrors COLUMNS above).
  const handleExport = () => {
    const csv = rowsToCsv(rows, [
      { key: "productCd", header: "제품코드" },
      { key: "productNm", header: "제품명" },
      { key: "createdAt", header: "등록일자" },
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `product-types_${date}.csv`);
  };

  return (
    <>
      {/* DataGridToolbar (separate strip above DataGrid — per baseline JSDoc pattern). */}
      <DataGridToolbar onExport={handleExport} exportLabel={t("Common.Excel.label")} />

      <DataGrid<ProductTypeRow>
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
            productCd: (f.productCd as string | undefined) ?? "",
            productNm: (f.productNm as string | undefined) ?? "",
          };
          // Sync changed keys to URL via useUrlFilters.
          if (next.productCd !== values.productCd) setValue("productCd", next.productCd);
          if (next.productNm !== values.productNm) setValue("productNm", next.productNm);
          reload(1, next);
        }}
        onSave={async (changes) => {
          const result = await saveProductTypes(changes);
          if (result.ok) {
            await reload(page, values);
          }
          return result;
        }}
      />
    </>
  );
}
