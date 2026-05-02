"use client";
/**
 * apps/web/app/(app)/sales/activities/_components/ActivitiesGridContainer.tsx
 *
 * sales/activities DataGrid container — ibSheet 10 visible columns
 * (TBIZ115 ground truth, plan estimate). schema는 더 많지만 grid에는 10개만 노출.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { type ActivityRow } from "@jarvis/shared/validation/sales/activity";
import { listActivities, saveActivities } from "../actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { type GridRow, overlayGridRows, rowsToBatch } from "@/components/grid/useGridState";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type { ColumnDef } from "@/components/grid/types";
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
  const router = useRouter();
  const initialFilterMap = useMemo(() => {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(initialFilters)) if (val) v[k] = val;
    return v;
  }, [initialFilters]);

  const [rows, setRows] = useState<Activity[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("sales.activities.page", initialPage);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "sales.activities.filters",
    initialFilterMap,
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "sales.activities.pendingFilters",
    initialFilterMap,
  );
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<Activity>[]>(
    "sales.activities.gridRows",
    [],
  );
  const [isExporting, setIsExporting] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [isSearching, startTransition] = useTransition();

  useTabDirty(dirtyCount > 0);

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/sales/activities";
  const tabKey = pathnameToTabKey(pathname);
  const initialGridRows = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(initial, gridRowsCache.length > 0 ? gridRowsCache : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const ctx = useTabContext();
  const gridRowsCacheRef = useRef(gridRowsCache);
  gridRowsCacheRef.current = gridRowsCache;
  useEffect(() => {
    return ctx.registerSaveHandler(tabKey, async () => {
      const changes = rowsToBatch(gridRowsCacheRef.current);
      if (
        changes.creates.length === 0 &&
        changes.updates.length === 0 &&
        changes.deletes.length === 0
      ) {
        return { ok: true };
      }
      const result = await saveActivities({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

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
      <GridSearchForm
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label="활동유형" className="w-[140px]">
          <select
            value={pendingFilters.actTypeCode ?? ""}
            onChange={(e) => setPending("actTypeCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {codeOptions.actType.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="영업기회단계" className="w-[140px]">
          <select
            value={pendingFilters.bizStepCode ?? ""}
            onChange={(e) => setPending("bizStepCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {codeOptions.bizStep.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="영업기회" className="w-[140px]">
          <select
            value={pendingFilters.opportunityId ?? ""}
            onChange={(e) => setPending("opportunityId", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {opportunityOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="활동명" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="활동명"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<Activity>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={[]}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onDirtyChange={setDirtyCount}
        onRowDoubleClick={(row) => router.push("/sales/activities/" + row.id + "/edit")}
        onExport={handleExport}
        isExporting={isExporting}
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
