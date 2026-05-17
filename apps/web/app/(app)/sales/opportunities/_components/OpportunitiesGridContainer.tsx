"use client";
/**
 * apps/web/app/(app)/sales/opportunities/_components/OpportunitiesGridContainer.tsx
 *
 * sales/opportunities DataGrid container — ibSheet 9 visible columns
 * (TBIZ110 ground truth). schema는 35 컬럼이지만 grid에는 9개만 노출.
 *
 * 2026-05-11 (A2 P0-3/P0-4/P0-5):
 *   - isAdmin prop을 page에서 받아 MemoModal에 전달 (서버 ownership check와 UI hint sync).
 *   - 컬럼 라벨·필터 라벨·placeholder·버튼 텍스트 모두 t() 통과.
 *   - useUrlFilters로 필터/페이지 URL state 동기화 (cross-tab leak 차단).
 *   - customerName 컬럼 editable: false — list/detail 모두 salesCustomer.custNm via JOIN.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type OpportunityRow } from "@jarvis/shared/validation/sales/opportunity";
import { listOpportunities, saveOpportunities } from "../actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { type GridRow, overlayGridRows, rowsToBatch } from "@/components/grid/useGridState";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type { ColumnDef } from "@/components/grid/types";
import { MemoModal } from "./MemoModal";

type Opportunity = OpportunityRow;
type Option = { value: string; label: string };

type Props = {
  initial: Opportunity[];
  total: number;
  page: number;
  limit: number;
  initialFilters: Record<string, string | undefined>;
  isAdmin?: boolean;
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
  limit: initialLimit,
  initialFilters,
  isAdmin = false,
  codeOptions,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Sales.Opportunities");
  const tCommon = useTranslations("Sales.Common");

  // URL state — single source of truth for filters/page across tab switches.
  const { values, setValues } = useUrlFilters<{
    page: string;
    q: string;
    bizStepCode: string;
    productTypeCode: string;
    focusOnly: string;
  }>({
    defaults: {
      page: String(initialPage),
      q: initialFilters.q ?? "",
      bizStepCode: initialFilters.bizStepCode ?? "",
      productTypeCode: initialFilters.productTypeCode ?? "",
      focusOnly: initialFilters.focusOnly ?? "",
    },
  });

  const initialFilterMap = useMemo(() => {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(initialFilters)) if (val) v[k] = val;
    return v;
  }, [initialFilters]);

  const [rows, setRows] = useState<Opportunity[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [limit, setLimit] = useState(initialLimit);
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "sales.opportunities.pendingFilters",
    initialFilterMap,
  );
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<Opportunity>[]>(
    "sales.opportunities.gridRows",
    [],
  );
  const [isExporting, setIsExporting] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [isSearching, startTransition] = useTransition();

  useTabDirty(dirtyCount > 0);

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const currentPage = Math.max(1, Number(values.page) || 1);

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/sales/opportunities";
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
  const gridApiRef = useRef<{ discardChanges: () => void } | null>(null);
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
      const result = await saveOpportunities({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

  const reload = useCallback(
    (nextPage: number, nextFilters: { q: string; bizStepCode: string; productTypeCode: string; focusOnly: string }, nextLimit?: number) => {
      startTransition(async () => {
        const focusOnly =
          nextFilters.focusOnly === "Y"
            ? true
            : nextFilters.focusOnly === "N"
              ? false
              : undefined;
        const res = await listOpportunities({
          q: nextFilters.q || undefined,
          bizStepCode: nextFilters.bizStepCode || undefined,
          productTypeCode: nextFilters.productTypeCode || undefined,
          focusOnly,
          page: nextPage,
          limit: nextLimit ?? limit,
        });
        if ("ok" in res && res.ok) {
          setRows(res.rows as Opportunity[]);
          setTotalCount(res.total as number);
        }
      });
    },
    [limit],
  );

  const handleSearch = useCallback(() => {
    setValues({
      page: "1",
      q: pendingFilters.q ?? "",
      bizStepCode: pendingFilters.bizStepCode ?? "",
      productTypeCode: pendingFilters.productTypeCode ?? "",
      focusOnly: pendingFilters.focusOnly ?? "",
    });
    reload(1, {
      q: pendingFilters.q ?? "",
      bizStepCode: pendingFilters.bizStepCode ?? "",
      productTypeCode: pendingFilters.productTypeCode ?? "",
      focusOnly: pendingFilters.focusOnly ?? "",
    });
  }, [pendingFilters, setValues, reload]);

  const COLUMNS: ColumnDef<Opportunity>[] = useMemo(
    () => [
      { key: "bizOpNm", label: t("columns.bizOpNm"), type: "text", width: 250, editable: true, required: true },
      // A2 P0-2: customerName is JOIN-sourced (salesCustomer.custNm) — readonly.
      // The denorm column `sales_opportunity.customer_name` is still in schema
      // but server-side saveOpportunities strips it (see opportunities/actions.ts).
      { key: "customerName", label: t("columns.customerName"), type: "text", width: 100, editable: false },
      { key: "productTypeCode", label: t("columns.productType"), type: "select", width: 120, editable: true, options: codeOptions.productType },
      { key: "bizStepCode", label: t("columns.bizStep"), type: "select", width: 80, editable: true, options: codeOptions.bizStep },
      { key: "bizStepYmd", label: t("columns.bizStepYmd"), type: "date", width: 100, editable: true },
      { key: "orgNm", label: t("columns.orgNm"), type: "text", width: 100, editable: true },
      { key: "insUserName", label: t("columns.insName"), type: "text", width: 60, editable: false },
      { key: "bizOpSourceCode", label: t("columns.bizOpSource"), type: "select", width: 200, editable: true, options: codeOptions.bizOpSource },
      { key: "focusMgrYn", label: t("columns.focusMgrYn"), type: "boolean", width: 80, editable: true },
      { key: "insDate", label: t("columns.insdate"), type: "date", width: 100, editable: false },
      {
        key: "id" as keyof Opportunity & string,
        label: t("columns.memo"),
        type: "readonly",
        width: 70,
        render: (row) =>
          row.id && row.bizOpNm ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMemoTarget({ id: row.id, name: row.bizOpNm });
              }}
              className="rounded bg-(--brand-primary-bg) px-2 py-0.5 text-xs text-(--brand-primary) hover:bg-(--brand-primary-bg)"
            >
              {t("Memo.memoButton")}
            </button>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
    ],
    [codeOptions.productType, codeOptions.bizStep, codeOptions.bizOpSource, t],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.filter((c) => c.label !== t("columns.memo")).map((c) => ({ key: c.key as string, header: c.label }));
      const productTypeMap = new Map(codeOptions.productType.map((o) => [o.value, o.label]));
      const bizStepMap = new Map(codeOptions.bizStep.map((o) => [o.value, o.label]));
      const bizOpSourceMap = new Map(codeOptions.bizOpSource.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: t("title"),
        sheetName: t("title"),
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
  }, [COLUMNS, rows, codeOptions.productType, codeOptions.bizStep, codeOptions.bizOpSource, t]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <GridSearchForm
        onResetGrid={() => gridApiRef.current?.discardChanges()}
        onSearch={handleSearch}
        isSearching={isSearching}
      >
        <GridFilterField label={t("filters.bizStep")} className="w-[140px]">
          <select
            value={pendingFilters.bizStepCode ?? ""}
            onChange={(e) => setPending("bizStepCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{tCommon("selectAll")}</option>
            {codeOptions.bizStep.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("filters.productType")} className="w-[140px]">
          <select
            value={pendingFilters.productTypeCode ?? ""}
            onChange={(e) => setPending("productTypeCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{tCommon("selectAll")}</option>
            {codeOptions.productType.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("filters.focusOnly")} className="w-[120px]">
          <select
            value={pendingFilters.focusOnly ?? ""}
            onChange={(e) => setPending("focusOnly", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{tCommon("selectAll")}</option>
            <option value="Y">{t("filters.focusOnlyYes")}</option>
            <option value="N">{t("filters.focusOnlyNo")}</option>
          </select>
        </GridFilterField>
        <GridFilterField label={t("filters.q")} className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("placeholders.q")}
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<Opportunity>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onGridReady={(api) => { gridApiRef.current = api; }}
        onDirtyChange={setDirtyCount}
        onRowDoubleClick={(row) => router.push("/sales/opportunities/" + row.id + "/edit")}
        onExport={handleExport}
        isExporting={isExporting}
        windowedPagination
        onAutoLimitChange={(next) => {
          setLimit(next);
          reload(1, {
            q: values.q,
            bizStepCode: values.bizStepCode,
            productTypeCode: values.productTypeCode,
            focusOnly: values.focusOnly,
          }, next);
        }}
        onPageChange={(p) => {
          setValues({ page: String(p) });
          reload(p, {
            q: values.q,
            bizStepCode: values.bizStepCode,
            productTypeCode: values.productTypeCode,
            focusOnly: values.focusOnly,
          });
        }}
        onFilterChange={() => {
          // Filters are handled by GridSearchForm above
        }}
        onSave={async (changes) => {
          const result = await saveOpportunities({
            creates: changes.creates,
            updates: changes.updates.map((u) => ({ id: u.id, patch: u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) {
            await reload(currentPage, {
              q: values.q,
              bizStepCode: values.bizStepCode,
              productTypeCode: values.productTypeCode,
              focusOnly: values.focusOnly,
            });
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
        opportunityId={memoTarget?.id ?? null}
        opportunityName={memoTarget?.name}
        isAdmin={isAdmin}
        onClose={() => setMemoTarget(null)}
      />
    </div>
  );
}
