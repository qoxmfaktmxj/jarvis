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
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useGridState, type GridRow } from "./useGridState";
import { GridToolbar } from "./GridToolbar";
import { ColumnFilterRow } from "./ColumnFilterRow";
import { RowStatusBadge } from "./RowStatusBadge";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { EditableTextCell } from "./cells/EditableTextCell";
import { EditableTextAreaCell } from "./cells/EditableTextAreaCell";
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
  /** 빈 상태 메시지 — 미지정 시 `Common.Grid.empty` 사용. */
  emptyMessage?: string;
  /**
   * 그리드의 dirty 행 수가 바뀔 때마다 호출. 탭 dirty 마커 + 저장 핸들러
   * 등록에 사용. (옵션 — 미지정이면 호출 안 함.)
   */
  onDirtyChange?: (dirtyCount: number) => void;
  /**
   * 외부 캐시(예: useTabState)에서 복구한 그리드 행 상태. 미지정 시 `rows`
   * (server fresh)에서 초기화한다. 지정 시 server rows와 overlay 처리해
   * cached dirty/deleted/new 행을 보존한다.
   */
  initialGridRows?: GridRow<T>[];
  /**
   * useGridState 내부 rows 상태가 변할 때마다 호출. 캐시 mirror에 사용.
   */
  onGridRowsChange?: (rows: GridRow<T>[]) => void;
  /**
   * 컬럼 헤더 위에 한 줄 더 렌더링할 그룹 헤더 행.
   * span 합계는 columns.length와 같아야 한다 (불일치 시 dev에서 console.warn).
   */
  groupHeaders?: GroupHeader[];
  /** 행 더블클릭 콜백 (master-detail 진입용) */
  onRowDoubleClick?: (row: T) => void;
  /** Excel 다운로드 콜백. 제공 시 GridToolbar 우측 끝에 [다운로드] 버튼이 표시된다. */
  onExport?: () => void | Promise<void>;
  /** 다운로드 진행 중 플래그 — 버튼 라벨 토글 + disabled 적용. */
  isExporting?: boolean;
  /** 다운로드 버튼 라벨 (미지정 시 `Common.Grid.export`). 도메인 verb override용. */
  exportLabel?: string;
  /** 다운로드 진행 중 라벨 (미지정 시 `Common.Grid.exporting`). */
  exportingLabel?: string;
  /**
   * 그리드가 mount된 뒤 한 번 호출. 컨테이너가 그리드 외부에서 `discardChanges`를
   * 트리거할 수 있도록 API를 노출한다 (GridSearchForm.onResetGrid wiring용).
   *
   * 사용 예:
   * ```tsx
   * const gridApiRef = useRef<{ discardChanges: () => void } | null>(null);
   * <DataGrid onGridReady={(api) => { gridApiRef.current = api; }} ... />
   * <GridSearchForm onResetGrid={() => gridApiRef.current?.discardChanges()} ... />
   * ```
   */
  onGridReady?: (api: { discardChanges: () => void }) => void;
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
  emptyMessage,
  groupHeaders,
  onDirtyChange,
  initialGridRows,
  onGridRowsChange,
  onRowDoubleClick,
  onExport,
  isExporting,
  exportLabel,
  exportingLabel,
  onGridReady,
}: DataGridProps<T>) {
  // Baseline strings come from `Common.Grid.*`. Callers may still override
  // `emptyMessage` per domain (e.g. "검색 결과 없음"), but DataGrid no longer
  // ships hardcoded Korean fallbacks.
  const t = useTranslations("Common.Grid");
  const resolvedEmpty = emptyMessage ?? t("empty");

  if (groupHeaders && process.env.NODE_ENV !== "production") {
    const sum = groupHeaders.reduce((acc, g) => acc + g.span, 0);
    if (sum !== columns.length) {
      console.warn(
        `[DataGrid] groupHeaders span sum (${sum}) does not match columns.length (${columns.length}).`,
      );
    }
  }

  const grid = useGridState<T>(initialRows, {
    initialRows: initialGridRows,
    onRowsChange: onGridRowsChange,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [localFilterValues, setLocalFilterValues] = useState<Record<string, string>>({});

  const filterValues = externalFilterValues ?? localFilterValues;

  // Expose discardChanges to parent container (GridSearchForm.onResetGrid wiring).
  useEffect(() => {
    onGridReady?.({ discardChanges: grid.discardChanges });
  }, [onGridReady, grid.discardChanges]);

  // Notify parent when dirty count changes (e.g. for tab dirty marker).
  useEffect(() => {
    onDirtyChange?.(grid.dirtyCount);
  }, [grid.dirtyCount, onDirtyChange]);

  // Sync server-fresh rows into the grid when the parent refetches (pagination,
  // filter change, etc.). useGridState's `useState(() => ...)` initializer only
  // runs once on mount, so without this effect the grid keeps showing page 1
  // rows after the parent navigates to page 2.
  //
  // We track the last-seen prop reference via a ref so the effect skips the
  // initial mount (where `initialRows` would already match the value passed to
  // useGridState's lazy initializer, and resetting would wipe any cached
  // dirty/new/deleted rows restored from sessionStorage).
  //
  // Pagination is guarded by UnsavedChangesDialog, so by the time new server
  // rows arrive, `dirtyCount` should already be 0. We still gate on it here as
  // a safety net — if a race ever lands fresh data while edits are pending, we
  // preserve the user's work rather than silently clobbering it.
  const lastInitialRowsRef = useRef(initialRows);
  useEffect(() => {
    if (initialRows === lastInitialRowsRef.current) return;
    lastInitialRowsRef.current = initialRows;
    if (grid.dirtyCount === 0) {
      grid.reset(initialRows);
    }
  }, [initialRows, grid.dirtyCount, grid.reset]);

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
        const msg = result.errors?.map((e) => e.message).join("\n") ?? t("saveFailed");
        alert(msg);
      }
    });
  }, [grid, onSave, setSaving, t]);

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
        <span className="text-sm text-(--fg-secondary)">{t("total", { count: total })}</span>
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
          onExport={onExport}
          isExporting={isExporting}
          exportLabel={exportLabel}
          exportingLabel={exportingLabel}
        />
      </div>

      <div className="overflow-auto rounded border border-(--border-default)">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-(--bg-surface) text-[11px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
            {groupHeaders && groupHeaders.length > 0 ? (
              <tr
                data-testid="group-header-row"
                className="border-b border-(--border-default) bg-(--bg-surface)"
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
            <tr className="border-b border-(--border-default)">
              {/* whitespace-nowrap: 한글 헤더가 좁은 컬럼에서 세로 줄바꿈되지 않게.
                  No=44px, 삭제=56px, 상태=64px 최소폭 보장. */}
              <th className="w-11 whitespace-nowrap px-2 py-2 text-left">{t("no")}</th>
              <th className="w-14 whitespace-nowrap px-2 py-2 text-center">{t("delete")}</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "whitespace-nowrap px-2 py-2",
                    col.type === "numeric" ? "text-right" : "text-left",
                  ].join(" ")}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-16 whitespace-nowrap px-2 py-2 text-center">{t("status")}</th>
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
                <td colSpan={columns.length + 3} className="px-4 py-12 text-center text-sm text-(--fg-muted)">
                  {resolvedEmpty}
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => (
                <tr
                  key={r.data.id}
                  data-row-status={r.state}
                  onClick={() => setSelected(r.data.id)}
                  onDoubleClick={() => onRowDoubleClick?.(r.data)}
                  className={[
                    "border-b border-(--border-default) transition-colors duration-150",
                    "hover:bg-(--bg-surface)",
                    selected === r.data.id ? "bg-blue-50/40" : "",
                    r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                    r.state === "new" ? "bg-blue-50/40" : "",
                    r.state === "dirty" ? "bg-amber-50/40" : "",
                  ].join(" ")}
                >
                  <td className="h-8 w-11 whitespace-nowrap px-2 align-middle text-[12px] text-(--fg-muted)">
                    {(page - 1) * limit + i + 1}
                  </td>
                  <td className="h-8 w-14 whitespace-nowrap px-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.state === "deleted"}
                      onChange={() =>
                        r.state === "new"
                          ? grid.removeNew(r.data.id)
                          : grid.toggleDelete(r.data.id)
                      }
                      className="h-4 w-4 rounded border-(--border-default) text-(--brand-primary) focus:ring-2 focus:ring-(--border-focus) focus:ring-offset-0"
                    />
                  </td>
                  {columns.map((col) => {
                    const val = (r.data as Record<string, unknown>)[col.key];
                    const commit = (v: unknown) =>
                      grid.update(r.data.id, col.key as keyof T, v as T[keyof T]);

                    if (col.type === "readonly" || !col.editable) {
                      const isNumeric = col.type === "numeric";
                      // Numeric readonly: format both number and Drizzle `numeric()` strings.
                      // For strings preserve trailing zeros by splitting on "." (P0-1).
                      let numericDisplay: string | null = null;
                      if (isNumeric && (typeof val === "number" || typeof val === "string")) {
                        const raw = typeof val === "string" ? val.trim() : String(val);
                        if (raw !== "") {
                          const negative = raw.startsWith("-");
                          const body = negative ? raw.slice(1) : raw;
                          const [intPart, fracPart] = body.split(".");
                          const intNumber = Number(intPart);
                          if (Number.isFinite(intNumber)) {
                            const intFmt = intNumber.toLocaleString("ko-KR");
                            const out = fracPart !== undefined ? `${intFmt}.${fracPart}` : intFmt;
                            numericDisplay = negative ? `-${out}` : out;
                          }
                        }
                      }
                      const display = col.render
                        ? col.render(r.data)
                        : numericDisplay !== null
                          ? numericDisplay
                          : String(val ?? "");
                      return (
                        <td
                          key={col.key}
                          data-col={col.key}
                          data-cell-value={String(val ?? "")}
                          className={[
                            "h-8 px-2 align-middle text-[13px] text-(--fg-primary)",
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
                        {col.type === "textarea" && (
                          <EditableTextAreaCell
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
                        {col.type === "numeric" && col.integer === true && (
                          <EditableNumericCell
                            mode="integer"
                            value={
                              val === null || val === undefined || val === ""
                                ? null
                                : Number(val)
                            }
                            onChange={(next) =>
                              // integer columns commit as `number` for Zod `.int()`.
                              commit(next === null ? null : next)
                            }
                          />
                        )}
                        {col.type === "numeric" && col.integer !== true && (
                          <EditableNumericCell
                            mode="decimal"
                            value={
                              val === null || val === undefined || val === ""
                                ? null
                                : String(val)
                            }
                            onChange={(next) =>
                              // decimal commits raw string — preserve precision +
                              // trailing zeros for Drizzle `numeric()` SoT.
                              commit(next)
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="h-8 w-16 whitespace-nowrap px-2 text-center align-middle">
                    <RowStatusBadge state={r.state} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/*
        Pagination — total <= limit이면 자동 hide.
        페이지 1개로 끝나는 그리드(holidays같이 row 수 적은 master)는 페이지
        컨트롤 자체가 noise라 그리드 표준에서 자동 숨김. total > limit인
        그리드만 prev/N/M/next 컨트롤 표시. explicit override prop 없음 —
        rows 수가 limit을 넘는 순간 자동 표시되므로 consumer가 결정할 일 없음.
      */}
      {total > limit && (
        <div className="flex items-center justify-end gap-2 text-sm text-(--fg-secondary)">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || saving}
            onClick={() => guarded(() => onPageChange(page - 1))}
          >
            {t("prev")}
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
            {t("next")}
          </Button>
        </div>
      )}

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
