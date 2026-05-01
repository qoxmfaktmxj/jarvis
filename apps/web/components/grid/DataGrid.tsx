"use client";
/**
 * apps/web/components/grid/DataGrid.tsx
 *
 * 공통 DataGrid 오케스트레이터.
 * admin/companies → sales/* 모든 그리드 도메인이 이 컴포넌트를 wrapping한다.
 *
 * 디자인 표준 (jarvis-architecture "그리드 표준 화면"):
 * - 행 높이: h-8 (32px)
 * - 헤더: bg-slate-50, text-[11px] font-semibold uppercase tracking-wide
 * - 인라인 편집: 클릭 시 파란 ring, blur에서 커밋
 * - 상태 배지: new/dirty/deleted 색상 pill
 */
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useGridState } from "./useGridState";
import { GridToolbar } from "./GridToolbar";
import { ColumnFilterRow } from "./ColumnFilterRow";
import { RowStatusBadge } from "./RowStatusBadge";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { EditableTextCell } from "./cells/EditableTextCell";
import { EditableSelectCell } from "./cells/EditableSelectCell";
import { EditableDateCell } from "./cells/EditableDateCell";
import { EditableBooleanCell } from "./cells/EditableBooleanCell";
import { EditableNumericCell } from "./cells/EditableNumericCell";
import type {
  ColumnDef,
  FilterDef,
  GridChanges,
  GridSaveResult,
  GroupHeader,
} from "./types";

type WithId = { id: string };

export type DataGridProps<T extends WithId> = {
  /** 현재 페이지의 행 데이터 */
  rows: T[];
  /** 전체 레코드 수 */
  total: number;
  /** 컬럼 정의 */
  columns: ColumnDef<T>[];
  /** 필터 정의 */
  filters: FilterDef<T>[];
  /** 현재 페이지 번호 (1-based) */
  page: number;
  /** 페이지당 행 수 */
  limit: number;
  /** 새 행을 삽입할 때 빈 row 생성 */
  makeBlankRow: () => T;
  /** 페이지 이동 콜백 */
  onPageChange: (page: number) => void;
  /** 필터 변경 콜백 */
  onFilterChange: (filters: Record<string, string>) => void;
  /** 저장 콜백 (batch transaction) */
  onSave: (changes: GridChanges<T>) => Promise<GridSaveResult>;
  /** 현재 필터 값 */
  filterValues?: Record<string, string>;
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /**
   * 컬럼 헤더 위에 한 줄 더 렌더링할 그룹 헤더 행.
   * span 합계는 columns.length와 같아야 한다 (불일치 시 dev에서 console.warn).
   */
  groupHeaders?: GroupHeader[];
};

export function DataGrid<T extends WithId>({
  rows: initialRows,
  total,
  columns,
  filters,
  page,
  limit,
  makeBlankRow,
  onPageChange,
  onFilterChange,
  onSave,
  filterValues: externalFilterValues,
  emptyMessage = "데이터가 없습니다.",
  groupHeaders,
}: DataGridProps<T>) {
  if (groupHeaders && process.env.NODE_ENV !== "production") {
    const sum = groupHeaders.reduce((acc, g) => acc + g.span, 0);
    if (sum !== columns.length) {
      console.warn(
        `[DataGrid] groupHeaders span sum (${sum}) does not match columns.length (${columns.length}).`,
      );
    }
  }

  const grid = useGridState<T>(initialRows);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [localFilterValues, setLocalFilterValues] = useState<Record<string, string>>({});

  const filterValues = externalFilterValues ?? localFilterValues;

  const guarded = useCallback(
    (action: () => void) => {
      if (grid.dirtyCount > 0) {
        setPendingNav(() => action);
      } else {
        action();
      }
    },
    [grid.dirtyCount],
  );

  const handleSave = useCallback(() => {
    setSaving(async () => {
      const changes = grid.toBatch();
      const result = await onSave(changes);
      if (result.ok) {
        // reload은 부모가 담당 (페이지 이동 또는 router.refresh)
        // 여기서는 낙관적으로 상태만 clean으로 리셋
        grid.reset(grid.rows.map((r) => r.data));
      } else {
        const msg = result.errors?.map((e) => e.message).join("\n") ?? "저장 실패";
        alert(msg);
      }
    });
  }, [grid, onSave, setSaving]);

  const handleFilterChange = useCallback(
    (next: Record<string, string>) => {
      if (externalFilterValues === undefined) {
        setLocalFilterValues(next);
      }
      guarded(() => onFilterChange(next));
    },
    [externalFilterValues, guarded, onFilterChange],
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">전체 {total.toLocaleString()}건</span>
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={() => grid.insertBlank(makeBlankRow())}
          onCopy={
            selected
              ? () =>
                  grid.duplicate(selected, (c) => ({
                    ...c,
                    id: crypto.randomUUID(),
                  }))
              : undefined
          }
          onSave={handleSave}
        />
      </div>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {groupHeaders && groupHeaders.length > 0 ? (
              <tr
                data-testid="group-header-row"
                className="border-b border-slate-200 bg-slate-100"
              >
                <th className="w-10 px-2 py-2" aria-hidden colSpan={2} />
                {groupHeaders.map((g, idx) => (
                  <th
                    key={`${g.label}-${idx}`}
                    colSpan={g.span}
                    className={[
                      "px-2 py-2 text-center font-semibold",
                      g.className ?? "",
                    ].join(" ")}
                  >
                    {g.label}
                  </th>
                ))}
                <th aria-hidden />
              </tr>
            ) : null}
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">No</th>
              <th className="w-10 px-2 py-2">삭제</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-2 py-2",
                    col.type === "numeric" ? "text-right" : "text-left",
                  ].join(" ")}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-16 px-2 py-2 text-left">상태</th>
            </tr>
            <ColumnFilterRow<T>
              filters={filters}
              values={filterValues}
              onChange={handleFilterChange}
              leadingCols={2}
            />
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 3} className="px-4 py-12 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => (
                <tr
                  key={r.data.id}
                  data-row-status={r.state}
                  onClick={() => setSelected(r.data.id)}
                  className={[
                    "border-b border-slate-100 transition-colors duration-150",
                    "hover:bg-slate-50",
                    selected === r.data.id ? "bg-blue-50/40" : "",
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
                          ? grid.removeNew(r.data.id)
                          : grid.toggleDelete(r.data.id)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    />
                  </td>
                  {columns.map((col) => {
                    const val = (r.data as Record<string, unknown>)[col.key];
                    const commit = (v: unknown) =>
                      grid.update(r.data.id, col.key as keyof T, v as T[keyof T]);

                    if (col.type === "readonly" || !col.editable) {
                      const isNumeric = col.type === "numeric";
                      const display = col.render
                        ? col.render(r.data)
                        : isNumeric && typeof val === "number"
                          ? val.toLocaleString("ko-KR")
                          : String(val ?? "");
                      return (
                        <td
                          key={col.key}
                          data-col={col.key}
                          data-cell-value={String(val ?? "")}
                          className={[
                            "h-8 px-2 align-middle text-[13px] text-slate-900",
                            isNumeric ? "text-right" : "",
                          ].join(" ")}
                        >
                          {display}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.key}
                        data-col={col.key}
                        data-cell-value={String(val ?? "")}
                        className="h-8 p-0 align-middle"
                        style={col.width ? { width: col.width } : undefined}
                      >
                        {col.type === "text" && (
                          <EditableTextCell
                            value={val as string | null}
                            onCommit={commit}
                            required={col.required}
                          />
                        )}
                        {col.type === "select" && (
                          <EditableSelectCell
                            value={val as string | null}
                            options={col.options ?? []}
                            onCommit={commit}
                            required={col.required}
                          />
                        )}
                        {col.type === "date" && (
                          <EditableDateCell
                            value={val as string | null}
                            onCommit={commit}
                          />
                        )}
                        {col.type === "boolean" && (
                          <EditableBooleanCell
                            value={Boolean(val)}
                            onCommit={commit}
                          />
                        )}
                        {col.type === "numeric" && (
                          <EditableNumericCell
                            value={
                              val === null || val === undefined || val === ""
                                ? null
                                : Number(val)
                            }
                            onChange={(next) => commit(next)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="h-8 w-16 px-2 align-middle">
                    <RowStatusBadge state={r.state} />
                  </td>
                </tr>
              ))
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
          onClick={() => guarded(() => onPageChange(page - 1))}
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
          onClick={() => guarded(() => onPageChange(page + 1))}
        >
          다음
        </Button>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={grid.dirtyCount}
        onSaveAndContinue={async () => {
          await handleSave();
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
