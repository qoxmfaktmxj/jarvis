"use client";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/_components/ProductCostMappingGrid.tsx
 *
 * 영업 제품군 × 코스트 매핑 그리드 (sales_product_type_cost / TBIZ024 row mapping).
 *
 * Phase-Sales P1.5 Task 6 (2026-05-01): initial implementation.
 * Phase-Sales P2-A Task 7.7 (2026-05-01):
 *   - DataGridToolbar + Excel export (exportProductCostMappingToExcel)
 *   - useUrlFilters for searchYmd, searchCostNm, page
 *   - findDuplicateKeys validation on 4-key composite (productTypeId|costId|sdate)
 *     Legacy JSP confirmed: enterCd|productTypeCd|costCd|sdate (line 76 productTypeMgr.jsp).
 *     In normalized schema, productTypeCd→productTypeId, costCd→costId, enterCd=workspaceId(implicit).
 *   - Search form additions: searchYmd (date), searchCostNm (text)
 *
 * Composite key for duplicate check: productTypeId | costId | sdate
 * (workspaceId is session-scoped, not stored in row object).
 *
 * Existing useProductCostMappingGridState hook is unchanged.
 * URL filter integration is at the container level (this component).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/DatePicker";
import { toast } from "@/hooks/use-toast";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import {
  type GridRow,
  overlayGridRows,
  rowsToBatch,
} from "@/components/grid/useGridState";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type { ProductCostMappingRow } from "@jarvis/shared/validation/sales/product-type-cost";
import { listProductCostMapping, saveProductCostMapping } from "../actions";
import { exportProductCostMappingToExcel } from "../export";
import {
  makeBlankProductCostMapping,
  useProductCostMappingGridState,
} from "./useProductCostMappingGridState";

/** Keys that form the duplicate-check composite (legacy JSP: enterCd|productTypeCd|costCd|sdate).
 *  workspaceId = enterCd is session-scoped and not part of the row; productTypeCd→productTypeId, costCd→costId. */
const COMPOSITE_KEYS = ["productTypeId", "costId", "sdate"] as const satisfies readonly (keyof ProductCostMappingRow)[];

type Option = { value: string; label: string };

type Props = {
  initialRows: ProductCostMappingRow[];
  initialTotal: number;
  page: number;
  limit: number;
  initialSearchYmd: string;
  initialSearchCostNm: string;
  productTypeOptions: Option[];
  costOptions: Option[];
};

export function ProductCostMappingGrid({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  initialSearchYmd,
  initialSearchCostNm,
  productTypeOptions,
  costOptions,
}: Props) {
  const t = useTranslations("Sales");

  // Tab-aware: cache grid rows so unsaved edits survive tab switches.
  // URL preserves committed filters/page, so only gridRows + pendingFilters need useTabState.
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<ProductCostMappingRow>[]>(
    "sales.productCostMapping.gridRows",
    [],
  );
  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/sales/product-cost-mapping";
  const tabKey = pathnameToTabKey(pathname);
  const initialOverlay = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(initialRows, gridRowsCache.length > 0 ? gridRowsCache : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const grid = useProductCostMappingGridState(initialRows, {
    initialRows: initialOverlay,
    onRowsChange: setGridRowsCache,
  });
  useTabDirty(grid.dirtyCount > 0);

  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [saving, startSave] = useTransition();
  const [exporting, startExport] = useTransition();
  const [isSearching, startReload] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // URL filter state — drives reload and persists through navigation
  const { values: filterValues, setValue: setFilterValue } = useUrlFilters({
    defaults: {
      q: "",
      productTypeId: "",
      costId: "",
      searchYmd: initialSearchYmd,
      searchCostNm: initialSearchCostNm,
      page: String(initialPage),
    },
  });

  // pendingFilters — staged inputs; committed to URL + reload on [조회]
  const [pendingFilters, setPendingFilters] = useTabState<{
    searchCostNm: string;
    searchYmd: string;
    productTypeId: string;
    costId: string;
    q: string;
  }>("sales.productCostMapping.pendingFilters", {
    searchCostNm: initialSearchCostNm,
    searchYmd: initialSearchYmd,
    productTypeId: "",
    costId: "",
    q: "",
  });
  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  // Save handler for the tab close dialog. Mirrors validateAndSave's dedup guard.
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
      const liveRows = gridRowsCacheRef.current
        .filter((r) => r.state !== "deleted")
        .map((r) => r.data);
      const dups = findDuplicateKeys(liveRows, COMPOSITE_KEYS);
      if (dups.length > 0) {
        return { ok: false };
      }
      const result = await saveProductCostMapping({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

  const reload = useCallback(
    (
      nextPage: number,
      nextFilters: typeof filterValues,
    ) => {
      startReload(async () => {
        const res = await listProductCostMapping({
          q: nextFilters.q || undefined,
          productTypeId: nextFilters.productTypeId || undefined,
          costId: nextFilters.costId || undefined,
          searchYmd: nextFilters.searchYmd || undefined,
          searchCostNm: nextFilters.searchCostNm || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          grid.reset(res.rows as ProductCostMappingRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setValidationErrors([]);
        }
      });
    },
    [grid, limit],
  );

  const guarded = useCallback(
    (action: () => void) => {
      if (grid.dirtyCount > 0) setPendingNav(() => action);
      else action();
    },
    [grid.dirtyCount],
  );

  // Validate duplicate keys before save
  const validateAndSave = useCallback(() => {
    const allRows = grid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    const dups = findDuplicateKeys(allRows, COMPOSITE_KEYS);
    if (dups.length > 0) {
      setValidationErrors(
        dups.map(
          (key) => `중복된 키가 있습니다: 제품군·코스트·시작일 (${key})`,
        ),
      );
      return;
    }
    setValidationErrors([]);
    startSave(async () => {
      const changes = grid.toBatch();
      const result = await saveProductCostMapping({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        await reload(page, filterValues);
      } else {
        const msg = result.errors?.map((e) => e.message).join("\n") ?? "저장 실패";
        toast({
          variant: "destructive",
          title: "저장 실패",
          description: msg,
        });
      }
    });
  }, [grid, page, filterValues, reload]);

  const handleExport = useCallback(() => {
    startExport(async () => {
      const result = await exportProductCostMappingToExcel({
        q: filterValues.q || undefined,
        productTypeId: filterValues.productTypeId || undefined,
        costId: filterValues.costId || undefined,
        searchYmd: filterValues.searchYmd || undefined,
        searchCostNm: filterValues.searchCostNm || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        toast({
          variant: "destructive",
          title: t("Common.Excel.exportFailed"),
          description: t("Common.Excel.exportFailedDesc", { message: result.error ?? "" }),
        });
      }
    });
  }, [filterValues, t]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const productTypeLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of productTypeOptions) m.set(o.value, o.label);
    return m;
  }, [productTypeOptions]);
  const costLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of costOptions) m.set(o.value, o.label);
    return m;
  }, [costOptions]);

  return (
    <div className="space-y-3">
      {/* DataGridToolbar: insert/save buttons + Excel export */}
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={exporting ? t("Common.Excel.downloading") : t("Common.Excel.button")}
        isExporting={exporting}
      >
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={() => grid.insertBlank(makeBlankProductCostMapping())}
          onSave={validateAndSave}
        />
      </DataGridToolbar>

      {/* GridSearchForm: filter panel with [조회] button */}
      <GridSearchForm
        onSearch={() => {
          setFilterValue("q", pendingFilters.q);
          setFilterValue("productTypeId", pendingFilters.productTypeId);
          setFilterValue("costId", pendingFilters.costId);
          setFilterValue("searchCostNm", pendingFilters.searchCostNm);
          setFilterValue("searchYmd", pendingFilters.searchYmd);
          setFilterValue("page", "1");
          guarded(() => reload(1, { ...filterValues, ...pendingFilters, page: "1" }));
        }}
        isSearching={isSearching}
      >
        <GridFilterField label="제품군" className="w-[140px]">
          <select
            value={pendingFilters.productTypeId}
            onChange={(e) => setPending("productTypeId", e.target.value)}
            aria-label="제품군 필터"
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {productTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="코스트" className="w-[140px]">
          <select
            value={pendingFilters.costId}
            onChange={(e) => setPending("costId", e.target.value)}
            aria-label="코스트 필터"
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {costOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("Common.Search.searchCostNm")} className="w-[140px]">
          <Input
            type="text"
            aria-label={t("Common.Search.searchCostNm")}
            value={pendingFilters.searchCostNm}
            onChange={(e) => setPending("searchCostNm", e.target.value)}
            placeholder={t("Common.Search.searchCostNm")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("Common.Search.searchYmd")} className="w-[160px]">
          <DatePicker
            value={pendingFilters.searchYmd || null}
            onChange={(v) => setPending("searchYmd", v ?? "")}
            ariaLabel={t("Common.Search.searchYmd")}
          />
        </GridFilterField>
        <GridFilterField label="제품/코스트/비고" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="제품/코스트/비고"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {validationErrors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">전체 {total.toLocaleString()}건</span>
      </div>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">No</th>
              <th className="w-10 px-2 py-2">삭제</th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                {t("ProductCostMapping.columns.productType")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                {t("ProductCostMapping.columns.cost")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                {t("ProductCostMapping.columns.sdate")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                {t("ProductCostMapping.columns.edate")}
              </th>
              <th className="px-2 py-2 text-center" style={{ width: 70 }}>
                {t("ProductCostMapping.columns.bizYn")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                {t("ProductCostMapping.columns.note")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 150 }}>
                {t("ProductCostMapping.columns.createdAt")}
              </th>
              <th className="w-16 px-2 py-2 text-left">상태</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => {
                const row = r.data;
                const update = <K extends keyof ProductCostMappingRow>(
                  key: K,
                  value: ProductCostMappingRow[K],
                ) => grid.update(row.id, key, value);

                return (
                  <tr
                    key={row.id}
                    data-row-status={r.state}
                    className={[
                      "border-b border-slate-100 transition-colors duration-150",
                      "hover:bg-slate-50",
                      r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                      r.state === "new" ? "bg-blue-50/40" : "",
                      r.state === "dirty" ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td className="h-8 w-10 px-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={r.state === "deleted"}
                        onChange={() =>
                          r.state === "new"
                            ? grid.removeNew(row.id)
                            : grid.toggleDelete(row.id)
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                      />
                    </td>
                    {/* 제품군 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="productTypeId"
                      data-cell-value={row.productTypeId}
                    >
                      <EditableSelectCell
                        value={row.productTypeId || null}
                        options={productTypeOptions}
                        onCommit={(v) => update("productTypeId", v ?? "")}
                        required
                      />
                      {row.productTypeId &&
                        !productTypeOptions.find((o) => o.value === row.productTypeId) && (
                          <span className="ml-1 text-[11px] text-slate-400">
                            {productTypeLabel.get(row.productTypeId) ??
                              row.productTypeNm ??
                              "(deleted)"}
                          </span>
                        )}
                    </td>
                    {/* 코스트 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="costId"
                      data-cell-value={row.costId}
                    >
                      <EditableSelectCell
                        value={row.costId || null}
                        options={costOptions}
                        onCommit={(v) => update("costId", v ?? "")}
                        required
                      />
                      {row.costId && !costOptions.find((o) => o.value === row.costId) && (
                        <span className="ml-1 text-[11px] text-slate-400">
                          {costLabel.get(row.costId) ?? row.costNm ?? "(deleted)"}
                        </span>
                      )}
                    </td>
                    {/* 시작일 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="sdate"
                      data-cell-value={row.sdate}
                    >
                      <EditableDateCell
                        value={row.sdate || null}
                        onCommit={(v) => update("sdate", v ?? "")}
                      />
                    </td>
                    {/* 종료일 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="edate"
                      data-cell-value={row.edate ?? ""}
                    >
                      <EditableDateCell
                        value={row.edate}
                        onCommit={(v) => update("edate", v)}
                      />
                    </td>
                    {/* 사용중 (bizYn) */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="bizYn"
                      data-cell-value={String(row.bizYn)}
                    >
                      <EditableBooleanCell
                        value={Boolean(row.bizYn)}
                        onCommit={(v) => update("bizYn", v)}
                      />
                    </td>
                    {/* 비고 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="note"
                      data-cell-value={row.note ?? ""}
                    >
                      <EditableTextCell
                        value={row.note}
                        onCommit={(v) => update("note", v)}
                      />
                    </td>
                    {/* 등록일 (read-only) */}
                    <td className="h-8 px-2 align-middle text-[12px] text-slate-500">
                      {row.createdAt ? row.createdAt.slice(0, 10) : "—"}
                    </td>
                    <td className="h-8 w-16 px-2 align-middle">
                      <RowStatusBadge state={r.state} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || saving}
          onClick={() => {
            const next = page - 1;
            setFilterValue("page", String(next));
            guarded(() => reload(next, filterValues));
          }}
        >
          이전
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages || saving}
          onClick={() => {
            const next = page + 1;
            setFilterValue("page", String(next));
            guarded(() => reload(next, filterValues));
          }}
        >
          다음
        </Button>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={grid.dirtyCount}
        onSaveAndContinue={async () => {
          validateAndSave();
          pendingNav?.();
          setPendingNav(null);
        }}
        onDiscardAndContinue={() => {
          grid.reset(grid.rows.map((r) => r.data));
          pendingNav?.();
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}
