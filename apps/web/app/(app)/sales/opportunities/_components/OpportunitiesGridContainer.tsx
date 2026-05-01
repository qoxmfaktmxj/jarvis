"use client";
/**
 * apps/web/app/(app)/sales/opportunities/_components/OpportunitiesGridContainer.tsx
 *
 * sales/opportunities DataGrid container — ibSheet 9 visible columns
 * (TBIZ110 ground truth). schema는 35 컬럼이지만 grid에는 9개만 노출.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { type OpportunityRow } from "@jarvis/shared/validation/sales/opportunity";
import { listOpportunities, saveOpportunities } from "../actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import type { ColumnDef, FilterDef } from "@/components/grid/types";

type Opportunity = OpportunityRow;
type Option = { value: string; label: string };

type Props = {
  initial: Opportunity[];
  total: number;
  page: number;
  limit: number;
  initialFilters: Record<string, string | undefined>;
  codeOptions: {
    productType: Option[];
    bizStep: Option[];
    bizOpSource: Option[];
  };
};

function makeBlankRow(): Opportunity {
  return {
    id: crypto.randomUUID(),
    bizOpNm: "",
    customerId: null,
    customerName: null,
    productTypeCode: null,
    bizStepCode: null,
    bizStepYmd: null,
    orgNm: null,
    insUserId: null,
    insUserName: null,
    bizOpSourceCode: null,
    focusMgrYn: false,
    insDate: null,
  };
}

export function OpportunitiesGridContainer({
  initial,
  total,
  page: initialPage,
  limit,
  initialFilters,
  codeOptions,
}: Props) {
  const [rows, setRows] = useState<Opportunity[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(initialFilters)) if (val) v[k] = val;
    return v;
  });
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listOpportunities({
          q: nextFilters.q || undefined,
          bizStepCode: nextFilters.bizStepCode || undefined,
          productTypeCode: nextFilters.productTypeCode || undefined,
          page: nextPage,
          limit,
        });
        if ("ok" in res && res.ok) {
          setRows(res.rows as Opportunity[]);
          setTotalCount(res.total as number);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  const COLUMNS: ColumnDef<Opportunity>[] = useMemo(
    () => [
      { key: "bizOpNm", label: "영업기회명", type: "text", width: 250, editable: true, required: true },
      { key: "customerName", label: "고객사명", type: "text", width: 100, editable: true },
      { key: "productTypeCode", label: "제품군", type: "select", width: 120, editable: true, options: codeOptions.productType },
      { key: "bizStepCode", label: "영업기회단계", type: "select", width: 80, editable: true, options: codeOptions.bizStep },
      { key: "bizStepYmd", label: "단계 변경일", type: "date", width: 100, editable: true },
      { key: "orgNm", label: "담당부서", type: "text", width: 100, editable: true },
      { key: "insUserName", label: "영업담당", type: "text", width: 60, editable: false },
      { key: "bizOpSourceCode", label: "영업기회출처", type: "select", width: 200, editable: true, options: codeOptions.bizOpSource },
      { key: "insDate", label: "등록일자", type: "date", width: 100, editable: false },
    ],
    [codeOptions.productType, codeOptions.bizStep, codeOptions.bizOpSource],
  );

  const FILTERS: FilterDef<Opportunity>[] = [
    { key: "bizOpNm" as keyof Opportunity & string, type: "text", placeholder: "영업기회명" },
    { key: "bizStepCode" as keyof Opportunity & string, type: "select", options: codeOptions.bizStep },
    { key: "productTypeCode" as keyof Opportunity & string, type: "select", options: codeOptions.productType },
  ];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({ key: c.key as string, header: c.label }));
      const productTypeMap = new Map(codeOptions.productType.map((o) => [o.value, o.label]));
      const bizStepMap = new Map(codeOptions.bizStep.map((o) => [o.value, o.label]));
      const bizOpSourceMap = new Map(codeOptions.bizOpSource.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: "영업기회",
        sheetName: "영업기회",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "productTypeCode" && typeof v === "string") return productTypeMap.get(v) ?? v;
          if (col.key === "bizStepCode" && typeof v === "string") return bizStepMap.get(v) ?? v;
          if (col.key === "bizOpSourceCode" && typeof v === "string") return bizOpSourceMap.get(v) ?? v;
          if ((col.key === "insDate" || col.key === "bizStepYmd") && typeof v === "string") return v.slice(0, 10);
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [COLUMNS, rows, codeOptions.productType, codeOptions.bizStep, codeOptions.bizOpSource]);

  return (
    <div className="space-y-3">
      <DataGridToolbar
        onExport={handleExport}
        exportLabel="엑셀 다운로드"
        isExporting={isExporting}
      />
      <DataGrid<Opportunity>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => {
          const result = await saveOpportunities({
            creates: changes.creates,
            updates: changes.updates.map((u) => ({ id: u.id, patch: u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) {
            await reload(page, filterValues);
            return { ok: true, errors: [] };
          }
          const errs =
            "errors" in result && result.errors
              ? result.errors.map((e) => ({ message: e.message }))
              : "error" in result && result.error
                ? [{ message: result.error }]
                : [];
          return { ok: false, errors: errs };
        }}
      />
    </div>
  );
}
