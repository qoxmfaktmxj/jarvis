"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { sanitizeCellValue } from "@/lib/utils/sanitize-csv";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listProductTypes, saveProductTypes } from "../actions";
import type { ProductTypeRow } from "@jarvis/shared/validation/sales/product-type";

type Props = { rows: ProductTypeRow[]; total: number; page: number; limit: number };

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

export function ProductTypesGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const tCommon = useTranslations();
  const [rows, setRows] = useState<ProductTypeRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listProductTypes({ productCd: nextFilters.productCd || undefined, productNm: nextFilters.productNm || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as ProductTypeRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: typeof c.label === "string" ? c.label : c.key,
      }));
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await exportToExcel({
        filename: `product-types_${date}`,
        sheetName: "제품군",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => sanitizeCellValue(
          (row as Record<string, unknown>)[col.key]
        ),
      });
    } finally {
      setIsExporting(false);
    }
  }, [rows]);

  return (
    <>
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={tCommon("Sales.Common.Excel.label")}
        isExporting={isExporting}
      />
      <DataGrid<ProductTypeRow>
        syncWithUrl
        rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
        page={page} limit={limit} makeBlankRow={makeBlankRow} filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => { const result = await saveProductTypes(changes); if (result.ok) await reload(page, filterValues); return result; }}
      />
    </>
  );
}
