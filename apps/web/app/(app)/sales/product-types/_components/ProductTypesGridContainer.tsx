"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listProductTypes, saveProductTypes } from "../actions";
import type { ProductTypeRow } from "@jarvis/shared/validation/sales/product-type";

type Props = { rows: ProductTypeRow[]; total: number; page: number; limit: number };

function makeBlankRow(): ProductTypeRow {
  return { id: crypto.randomUUID(), productCd: "", productNm: "" };
}

const COLUMNS: ColumnDef<ProductTypeRow>[] = [
  { key: "productCd", label: "제품코드", type: "text", width: 120, editable: true, required: true },
  { key: "productNm", label: "제품명", type: "text", editable: true, required: true },
];

const FILTERS: FilterDef<ProductTypeRow>[] = [
  { key: "productCd", type: "text", placeholder: "제품코드" },
  { key: "productNm", type: "text", placeholder: "제품명" },
];

export function ProductTypesGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const [rows, setRows] = useState<ProductTypeRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listProductTypes({ productCd: nextFilters.productCd || undefined, productNm: nextFilters.productNm || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as ProductTypeRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  return (
    <DataGrid<ProductTypeRow>
      rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
      page={page} limit={limit} makeBlankRow={makeBlankRow} filterValues={filterValues}
      onPageChange={(p) => reload(p, filterValues)}
      onFilterChange={(f) => reload(1, f)}
      onSave={async (changes) => { const result = await saveProductTypes(changes); if (result.ok) await reload(page, filterValues); return result; }}
    />
  );
}
