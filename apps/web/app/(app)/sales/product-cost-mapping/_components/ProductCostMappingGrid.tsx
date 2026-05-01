"use client";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/_components/ProductCostMappingGrid.tsx
 *
 * 영업 제품군 × 코스트 매핑 그리드 (sales_product_type_cost / TBIZ024 row mapping).
 *
 * Phase-Sales P1.5 Task 6 (2026-05-01).
 *
 * Task 5 (admin/infra/licenses)와 동일한 커스텀 테이블 패턴: 공유 cell/hook
 * (useGridState · EditableTextCell · EditableSelectCell · EditableDateCell ·
 * EditableBooleanCell · GridToolbar · RowStatusBadge · UnsavedChangesDialog) 직접 조립.
 * <DataGrid>는 Phase-Sales P1.5 forbidden list 이므로 의도적으로 사용하지 않는다.
 *
 * 디자인 표준은 admin/companies와 동일: h-8 행, sticky bg-slate-50 헤더,
 * 신규/변경/삭제 상태 배지·행 색상.
 *
 * 컬럼 (ground-truth = packages/db/schema/sales-product-type.ts):
 *  - 제품군         (productTypeNm; EditableSelectCell, productTypeId 편집)
 *  - 코스트         (costNm;        EditableSelectCell, costId 편집)
 *  - 시작일         (sdate;         EditableDateCell, NOT NULL)
 *  - 종료일         (edate;         EditableDateCell, nullable)
 *  - 사용중         (bizYn;         EditableBooleanCell, NOT NULL default false)
 *  - 비고           (note;          EditableTextCell, nullable)
 *  - 등록일/등록자  (createdAt/createdBy; read-only display)
 *
 * Note: ko.json `Sales.ProductCostMapping.*` 키는 Task 10에서 도입. P1.5 동안은
 * inline Korean placeholder 문자열 (다른 sales/* 라우트도 동일).
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { Button } from "@/components/ui/button";
import type { ProductCostMappingRow } from "@jarvis/shared/validation/sales/product-type-cost";
import { listProductCostMapping, saveProductCostMapping } from "../actions";
import {
  makeBlankProductCostMapping,
  useProductCostMappingGridState,
} from "./useProductCostMappingGridState";

type Option = { value: string; label: string };

type Props = {
  initialRows: ProductCostMappingRow[];
  initialTotal: number;
  page: number;
  limit: number;
  productTypeOptions: Option[];
  costOptions: Option[];
};

export function ProductCostMappingGrid({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  productTypeOptions,
  costOptions,
}: Props) {
  const grid = useProductCostMappingGridState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<{
    q: string;
    productTypeId: string;
    costId: string;
  }>({
    q: "",
    productTypeId: "",
    costId: "",
  });
  const [saving, startSave] = useTransition();
  const [, startReload] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  const reload = useCallback(
    (
      nextPage: number,
      nextFilters: { q: string; productTypeId: string; costId: string },
    ) => {
      startReload(async () => {
        const res = await listProductCostMapping({
          q: nextFilters.q || undefined,
          productTypeId: nextFilters.productTypeId || undefined,
          costId: nextFilters.costId || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          grid.reset(res.rows as ProductCostMappingRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
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

  const handleSave = useCallback(() => {
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
        alert(msg);
      }
    });
  }, [grid, page, filterValues, reload]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // id → label lookups (for display fallback when join projection is missing
  // on a freshly-typed row before reload).
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
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">전체 {total.toLocaleString()}건</span>
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={() => grid.insertBlank(makeBlankProductCostMapping())}
          onSave={handleSave}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          placeholder="제품/코스트/비고"
          value={filterValues.q}
          onChange={(e) => {
            const next = { ...filterValues, q: e.target.value };
            setFilterValues(next);
          }}
          onBlur={() => guarded(() => reload(1, filterValues))}
          onKeyDown={(e) => {
            if (e.key === "Enter") guarded(() => reload(1, filterValues));
          }}
          className="h-8 w-64 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterValues.productTypeId}
          onChange={(e) => {
            const next = { ...filterValues, productTypeId: e.target.value };
            guarded(() => reload(1, next));
          }}
          className="h-8 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="제품군 필터"
        >
          <option value="">제품군 (전체)</option>
          {productTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterValues.costId}
          onChange={(e) => {
            const next = { ...filterValues, costId: e.target.value };
            guarded(() => reload(1, next));
          }}
          className="h-8 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="코스트 필터"
        >
          <option value="">코스트 (전체)</option>
          {costOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">No</th>
              <th className="w-10 px-2 py-2">삭제</th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                제품군
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                코스트
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                시작일
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                종료일
              </th>
              <th className="px-2 py-2 text-center" style={{ width: 70 }}>
                사용중
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 240 }}>
                비고
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 150 }}>
                등록일
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
          onClick={() => guarded(() => reload(page - 1, filterValues))}
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
          onClick={() => guarded(() => reload(page + 1, filterValues))}
        >
          다음
        </Button>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={grid.dirtyCount}
        onSaveAndContinue={async () => {
          handleSave();
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
