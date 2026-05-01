"use client";
/**
 * apps/web/app/(app)/sales/activities/_components/ActivitiesGridContainer.tsx
 *
 * sales/activities DataGrid container — ibSheet 10 visible columns
 * (TBIZ115 ground truth, plan estimate). schema는 더 많지만 grid에는 10개만 노출.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { type ActivityRow } from "@jarvis/shared/validation/sales/activity";
import { listActivities, saveActivities } from "../actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { MemoModal } from "./MemoModal";

type Activity = ActivityRow;
type Option = { value: string; label: string };

type Props = {
  initial: Activity[];
  total: number;
  page: number;
  limit: number;
  initialFilters: Record<string, string | undefined>;
  codeOptions: {
    actType: Option[];
    accessRoute: Option[];
    bizStep: Option[];
    productType: Option[];
  };
  opportunityOptions: Option[];
};

function makeBlankRow(): Activity {
  return {
    id: crypto.randomUUID(),
    bizActNm: "",
    opportunityId: null,
    customerId: null,
    customerName: null,
    actYmd: null,
    actTypeCode: null,
    accessRouteCode: null,
    attendeeUserId: null,
    attendeeUserName: null,
    bizStepCode: null,
    productTypeCode: null,
    actContent: null,
    insDate: null,
  };
}

export function ActivitiesGridContainer({
  initial,
  total,
  page: initialPage,
  limit,
  initialFilters,
  codeOptions,
  opportunityOptions,
}: Props) {
  const [rows, setRows] = useState<Activity[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(initialFilters)) if (val) v[k] = val;
    return v;
  });
  const [isExporting, setIsExporting] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listActivities({
          q: nextFilters.q || undefined,
          opportunityId: nextFilters.opportunityId || undefined,
          actTypeCode: nextFilters.actTypeCode || undefined,
          bizStepCode: nextFilters.bizStepCode || undefined,
          page: nextPage,
          limit,
        });
        if ("ok" in res && res.ok) {
          setRows(res.rows as Activity[]);
          setTotalCount(res.total as number);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  const COLUMNS: ColumnDef<Activity>[] = useMemo(
    () => [
      { key: "bizActNm", label: "활동명", type: "text", width: 250, editable: true, required: true },
      { key: "opportunityId", label: "영업기회", type: "select", width: 150, editable: true, options: opportunityOptions },
      { key: "customerName", label: "고객사", type: "text", width: 120, editable: false },
      { key: "actYmd", label: "활동일", type: "date", width: 100, editable: true },
      { key: "actTypeCode", label: "활동유형", type: "select", width: 100, editable: true, options: codeOptions.actType },
      { key: "accessRouteCode", label: "접근경로", type: "select", width: 100, editable: true, options: codeOptions.accessRoute },
      { key: "attendeeUserName", label: "참석자", type: "text", width: 100, editable: false },
      { key: "bizStepCode", label: "단계", type: "select", width: 80, editable: true, options: codeOptions.bizStep },
      { key: "productTypeCode", label: "제품군", type: "select", width: 100, editable: true, options: codeOptions.productType },
      { key: "insDate", label: "등록일자", type: "date", width: 100, editable: false },
      {
        key: "id" as keyof Activity & string,
        label: "메모",
        type: "readonly",
        width: 70,
        render: (row) =>
          row.id && row.bizActNm ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMemoTarget({ id: row.id, name: row.bizActNm });
              }}
              className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200"
            >
              메모
            </button>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
    ],
    [
      codeOptions.actType,
      codeOptions.accessRoute,
      codeOptions.bizStep,
      codeOptions.productType,
      opportunityOptions,
    ],
  );

  const FILTERS: FilterDef<Activity>[] = [
    { key: "bizActNm" as keyof Activity & string, type: "text", placeholder: "활동명" },
    { key: "actTypeCode" as keyof Activity & string, type: "select", options: codeOptions.actType },
    { key: "bizStepCode" as keyof Activity & string, type: "select", options: codeOptions.bizStep },
  ];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.filter((c) => c.label !== "메모").map((c) => ({ key: c.key as string, header: c.label }));
      const actTypeMap = new Map(codeOptions.actType.map((o) => [o.value, o.label]));
      const accessRouteMap = new Map(codeOptions.accessRoute.map((o) => [o.value, o.label]));
      const bizStepMap = new Map(codeOptions.bizStep.map((o) => [o.value, o.label]));
      const productTypeMap = new Map(codeOptions.productType.map((o) => [o.value, o.label]));
      const opportunityMap = new Map(opportunityOptions.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: "영업활동",
        sheetName: "영업활동",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "actTypeCode" && typeof v === "string") return actTypeMap.get(v) ?? v;
          if (col.key === "accessRouteCode" && typeof v === "string") return accessRouteMap.get(v) ?? v;
          if (col.key === "bizStepCode" && typeof v === "string") return bizStepMap.get(v) ?? v;
          if (col.key === "productTypeCode" && typeof v === "string") return productTypeMap.get(v) ?? v;
          if (col.key === "opportunityId" && typeof v === "string") return opportunityMap.get(v) ?? v;
          if ((col.key === "insDate" || col.key === "actYmd") && typeof v === "string") return v.slice(0, 10);
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    COLUMNS,
    rows,
    codeOptions.actType,
    codeOptions.accessRoute,
    codeOptions.bizStep,
    codeOptions.productType,
    opportunityOptions,
  ]);

  return (
    <div className="space-y-3">
      <DataGridToolbar
        onExport={handleExport}
        exportLabel="엑셀 다운로드"
        isExporting={isExporting}
      />
      <DataGrid<Activity>
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
          const result = await saveActivities({
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
      <MemoModal
        activityId={memoTarget?.id ?? null}
        activityName={memoTarget?.name}
        onClose={() => setMemoTarget(null)}
      />
    </div>
  );
}
