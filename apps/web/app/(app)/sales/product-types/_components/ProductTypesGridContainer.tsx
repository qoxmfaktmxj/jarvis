"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
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

const FILTERS: FilterDef<ProductTypeRow>[] = [];

export function ProductTypesGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const [rows, setRows] = useState<ProductTypeRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>({});
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listProductTypes({ productCd: nextFilters.productCd || undefined, productNm: nextFilters.productNm || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as ProductTypeRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  return (
    <div className="space-y-3">
      <GridSearchForm
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label="제품코드" className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.productCd ?? ""}
            onChange={(e) => setPending("productCd", e.target.value)}
            placeholder="제품코드"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="제품명" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.productNm ?? ""}
            onChange={(e) => setPending("productNm", e.target.value)}
            placeholder="제품명"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<ProductTypeRow>
        rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
        page={page} limit={limit} makeBlankRow={makeBlankRow} filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => { const result = await saveProductTypes(changes); if (result.ok) await reload(page, filterValues); return result; }}
      />
    </div>
  );
}
