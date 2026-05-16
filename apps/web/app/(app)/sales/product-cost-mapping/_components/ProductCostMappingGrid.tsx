"use client";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/_components/ProductCostMappingGrid.tsx
 *
 * 영업 제품군 × 코스트 매핑 그리드 (sales_product_type_cost / TBIZ024 row mapping).
 *
 * Phase D (2026-05-16): DataGrid 단독 사용으로 마이그레이션.
 * - 자체 <table> + EditableXxxCell 완전 제거
 * - DataGrid<ProductCostMappingRow> 단독 사용
 * - useProductCostMappingGridState wrapper hook 제거
 *   (DataGrid 내부 useGridState가 row 상태 관리)
 * - 복합키 중복 검사는 onSave 콜백 내 유지
 * - DataGridToolbar, UnsavedChangesDialog 제거 (DataGrid 내장)
 *
 * Composite key for duplicate check: productTypeId | costId | sdate
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
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
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { ProductCostMappingRow } from "@jarvis/shared/validation/sales/product-type-cost";
import { listProductCostMapping, saveProductCostMapping } from "../actions";
import { exportProductCostMappingToExcel } from "../export";
import { makeBlankProductCostMapping } from "./useProductCostMappingGridState";

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
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<ProductCostMappingRow>[]>(
    "sales.productCostMapping.gridRows",
    [],
  );
  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/sales/product-cost-mapping";
  const tabKey = pathnameToTabKey(pathname);
  const initialGridRows = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(initialRows, gridRowsCache.length > 0 ? gridRowsCache : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const [rows, setRows] = useState<ProductCostMappingRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [dirtyCount, setDirtyCount] = useState(0);
  useTabDirty(dirtyCount > 0);

  const [isExporting, startExport] = useTransition();
  const [isSearching, startReload] = useTransition();

  // URL filter state
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

  const currentPage = Math.max(1, Number(filterValues.page) || 1);

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

  // Tab close save handler
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
    (nextPage: number, nextFilters: typeof filterValues) => {
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
          setRows(res.rows as ProductCostMappingRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

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

  const handleSave = useCallback(
    async (changes: GridChanges<ProductCostMappingRow>): Promise<GridSaveResult> => {
      // Composite-key duplicate check (productTypeId | costId | sdate)
      const existingMerged = rows
        .filter((r) => !changes.deletes.includes(r.id))
        .map((r) => {
          const upd = changes.updates.find((u) => u.id === r.id);
          return upd ? { ...r, ...upd.patch } : r;
        });
      const allRows = [...changes.creates, ...existingMerged];
      const dups = findDuplicateKeys(allRows, COMPOSITE_KEYS);
      if (dups.length > 0) {
        return {
          ok: false,
          errors: [{ message: `중복된 키가 있습니다: 제품군·코스트·시작일 (${dups.join(", ")})` }],
        };
      }

      const result = await saveProductCostMapping({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        reload(currentPage, filterValues);
      } else {
        const msg = result.errors?.map((e) => e.message).join("\n") ?? "저장 실패";
        toast({
          variant: "destructive",
          title: "저장 실패",
          description: msg,
        });
      }
      return result;
    },
    [rows, currentPage, filterValues, reload],
  );

  const columns: ColumnDef<ProductCostMappingRow>[] = useMemo(
    () => [
      {
        key: "productTypeId",
        label: t("ProductCostMapping.columns.productType"),
        type: "select",
        width: 240,
        editable: true,
        required: true,
        options: productTypeOptions,
      },
      {
        key: "costId",
        label: t("ProductCostMapping.columns.cost"),
        type: "select",
        width: 240,
        editable: true,
        required: true,
        options: costOptions,
      },
      {
        key: "sdate",
        label: t("ProductCostMapping.columns.sdate"),
        type: "date",
        width: 130,
        editable: true,
        required: true,
      },
      {
        key: "edate",
        label: t("ProductCostMapping.columns.edate"),
        type: "date",
        width: 130,
        editable: true,
      },
      {
        key: "bizYn",
        label: t("ProductCostMapping.columns.bizYn"),
        type: "boolean",
        width: 70,
        editable: true,
      },
      {
        key: "note",
        label: t("ProductCostMapping.columns.note"),
        type: "text",
        editable: true,
      },
      {
        key: "createdAt",
        label: t("ProductCostMapping.columns.createdAt"),
        type: "readonly",
        width: 150,
        render: (row) => row.createdAt ? row.createdAt.slice(0, 10) : "—",
      },
    ],
    [t, productTypeOptions, costOptions],
  );

  return (
    <div className="space-y-3">
      <GridSearchForm
        onResetGrid={() => gridApiRef.current?.discardChanges()}
        onSearch={() => {
          setFilterValue("q", pendingFilters.q);
          setFilterValue("productTypeId", pendingFilters.productTypeId);
          setFilterValue("costId", pendingFilters.costId);
          setFilterValue("searchCostNm", pendingFilters.searchCostNm);
          setFilterValue("searchYmd", pendingFilters.searchYmd);
          setFilterValue("page", "1");
          reload(1, { ...filterValues, ...pendingFilters, page: "1" });
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

      <div className="flex items-center">
        <span className="text-sm text-(--fg-secondary)">
          {t("ProductCostMapping.title")} — {total.toLocaleString()}
        </span>
      </div>

      <DataGrid<ProductCostMappingRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankProductCostMapping}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onGridReady={(api) => { gridApiRef.current = api; }}
        onDirtyChange={setDirtyCount}
        onExport={handleExport}
        isExporting={isExporting}
        exportLabel={isExporting ? t("Common.Excel.downloading") : t("Common.Excel.button")}
        onPageChange={(p) => {
          setFilterValue("page", String(p));
          reload(p, { ...filterValues, page: String(p) });
        }}
        onFilterChange={() => undefined}
        onSave={handleSave}
        allowInsert={true}
        allowCopy={true}
        emptyMessage="데이터가 없습니다."
      />
    </div>
  );
}
