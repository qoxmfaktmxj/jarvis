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
  /**
   * [입력] 버튼 표시 여부 (default true). false이면 GridToolbar에서 hide.
   * 사용처: detail 그리드처럼 행 추가 없이 저장만 필요한 경우.
   */
  allowInsert?: boolean;
  /**
   * [복사] 버튼 표시 여부 (default true). false이면 GridToolbar에서 hide.
   */
  allowCopy?: boolean;
  /**
   * [복사] 시 새 행 생성 커스터마이즈. 미지정 시 원본 행에서 `id`만 새 UUID로
   * 교체. 지정 시 반환값을 새 행으로 사용.
   *
   * 사용처: 복사 시 일부 컬럼(예: code)을 초기화해야 하는 경우.
   */
  makeCopyRow?: (original: T) => T;
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
  /**
   * 선택된 행 ID (외부 제어). 미지정이면 DataGrid가 internal state로 관리.
   * 지정 시 highlight 표시 + 행 클릭 시 `onSelect(id)` 통지.
   *
   * 사용처: master/detail 패턴 — 부모가 selectedId를 보유하고 detail fetch
   * 트리거. admin/menus, admin/codes 등.
   */
  selectedId?: string | null;
  /**
   * 행 클릭 시 통지. selectedId 외부 제어 시 부모가 detail fetch 트리거.
   * 같은 행 재클릭 시 null로 통지하지 않음 (외부에서 직접 처리).
   */
  onSelect?: (id: string | null) => void;
  /**
   * 그리드 전체 read-only 모드.
   *  - 모든 셀이 readonly로 표시 (col.editable, col.lockOnExisting 무시)
   *  - GridToolbar(입력/복사/저장) 숨김
   *  - 삭제 체크박스 컬럼 숨김
   *  - 페이지네이션 / 필터 / 정렬 / 검색은 그대로
   *
   * 사용처: 통계·집계 그리드 (maintenance/stats), 권한 없는 사용자의 조회 등.
   */
  readOnly?: boolean;
  /**
   * GridToolbar(입력/복사/저장) 자체를 숨김. readOnly와 다르게 셀 편집은 가능.
   *
   * 사용처: modal 안의 임베드 그리드처럼 자체 저장 흐름을 부모가 관리하는 경우.
   */
  hideToolbar?: boolean;
  /**
   * 페이징 그리드 viewport-fit 모드. true이면:
   *  - table 영역 overflow-hidden (그리드 내부 스크롤 X)
   *  - ResizeObserver로 table 컨테이너 height 측정 → row 가능 수 계산
   *  - 측정 결과를 onAutoLimitChange 콜백으로 부모에 통지
   *  - 부모는 받은 limit으로 server reload
   *
   * default false → 기존 동작 (overflow-auto 내부 스크롤).
   *
   * 사용처: admin/companies, admin/users 등 페이징 그리드. 페이지 컨트롤로
   * 다음/이전 페이지 이동 + 한 페이지 전체가 viewport 안에 fit.
   */
  windowedPagination?: boolean;
  /**
   * windowedPagination=true일 때 ResizeObserver가 측정한 row 가능 수를 부모에
   * 통지. 부모는 이 값을 limit으로 server fetch.
   * - 측정 결과가 직전 호출과 같으면 호출 안 함 (loop 방지)
   * - debounce 100ms로 resize 시 storm 방지
   */
  onAutoLimitChange?: (limit: number) => void;
};

// 상수: viewport-fit 모드에서 row 가능 수를 계산할 때 사용
const HEADER_ROW_HEIGHT = 36; // thead 헤더 행 (py-2 + text-[11px] 기준)
const FILTER_ROW_HEIGHT = 32; // per-column filter row 높이 (filters.length > 0일 때)
const ROW_HEIGHT = 32; // tbody 행 높이 (h-8)
const AUTO_LIMIT_DEBOUNCE_MS = 100;

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
  allowInsert = true,
  allowCopy = true,
  makeCopyRow,
  onExport,
  isExporting,
  exportLabel,
  exportingLabel,
  onGridReady,
  selectedId,
  onSelect,
  readOnly = false,
  hideToolbar = false,
  windowedPagination = false,
  onAutoLimitChange,
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
  // selected row state — selectedId prop이 있으면 외부 제어, 없으면 internal.
  // 외부 제어 시 행 클릭은 onSelect로 통지하고 internal state는 무시.
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = selectedId !== undefined ? selectedId : internalSelected;
  const handleRowSelect = useCallback(
    (id: string) => {
      if (selectedId === undefined) {
        setInternalSelected(id);
      }
      onSelect?.(id);
    },
    [selectedId, onSelect],
  );
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

  // windowedPagination: ResizeObserver로 table 컨테이너 height을 측정하여
  // 가능한 row 수를 계산하고 onAutoLimitChange로 부모에 통지.
  // debounce 100ms로 resize storm 방지. cleanup 시 disconnect.
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastAutoLimitRef = useRef<number>(-1);
  const onAutoLimitChangeRef = useRef(onAutoLimitChange);
  onAutoLimitChangeRef.current = onAutoLimitChange;
  const filtersLengthRef = useRef(filters.length);
  filtersLengthRef.current = filters.length;
  const groupHeadersCountRef = useRef(groupHeaders?.length ?? 0);
  groupHeadersCountRef.current = groupHeaders?.length ?? 0;
  useEffect(() => {
    if (!windowedPagination) return;
    const el = tableWrapperRef.current;
    if (!el) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      const containerH = el.getBoundingClientRect().height;
      // 그룹 헤더 행이 있으면 추가 헤더 행 높이만큼 차감
      const groupHeaderH = groupHeadersCountRef.current > 0 ? HEADER_ROW_HEIGHT : 0;
      const filterH = filtersLengthRef.current > 0 ? FILTER_ROW_HEIGHT : 0;
      const chrome = HEADER_ROW_HEIGHT + groupHeaderH + filterH;
      const availableH = containerH - chrome;
      const newLimit = Math.max(1, Math.floor(availableH / ROW_HEIGHT));
      if (newLimit !== lastAutoLimitRef.current) {
        lastAutoLimitRef.current = newLimit;
        onAutoLimitChangeRef.current?.(newLimit);
      }
    };

    const debouncedMeasure = () => {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(measure, AUTO_LIMIT_DEBOUNCE_MS);
    };

    const observer = new ResizeObserver(debouncedMeasure);
    observer.observe(el);
    // 초기 측정 (mount 직후 한 번)
    measure();

    return () => {
      if (timerId !== null) clearTimeout(timerId);
      observer.disconnect();
    };
  }, [windowedPagination]);

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
    // viewport-fit 부모(PageShellFit + grid 셀 또는 GridContainer flex-col) 안
    // 에서 DataGrid가 height을 100% 받도록 flex h-full + min-h-0 + flex-1.
    // - flex-1: 부모가 flex container면 main-axis grow (GridContainer 안에서
    //   GridSearchForm 다음 남은 height 다 받음)
    // - h-full: 부모가 block이면 height 100% (PageShellFit 직접 자식 케이스)
    // table 영역만 flex-1 + overflow-auto/hidden로 내부 스크롤 or viewport-fit.
    // toolbar/pagination은 shrink-0. master/detail이 사이드 by 사이드 배치될
    // 때 두 그리드의 데이터 row 시작 y가 정확히 일치하도록 정렬 보장.
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {/*
        Toolbar 영역. readOnly 또는 hideToolbar이면 toolbar 자체 hide.
        readOnly: 통계/조회용 그리드. hideToolbar: modal 임베드 그리드.
        둘 다 false면 표준 toolbar 표시 (입력/복사/저장 + Excel export).
      */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-(--fg-secondary)">{t("total", { count: total })}</span>
        {!readOnly && !hideToolbar && (
          <GridToolbar
            dirtyCount={grid.dirtyCount}
            saving={saving}
            allowInsert={allowInsert}
            allowCopy={allowCopy}
            onInsert={() => grid.insertBlank(makeBlankRow())}
            onCopy={
              selected
                ? () =>
                    grid.duplicate(selected, (c) =>
                      makeCopyRow
                        ? makeCopyRow(c)
                        : { ...c, id: crypto.randomUUID() },
                    )
                : undefined
            }
            onSave={handleSave}
            onExport={onExport}
            isExporting={isExporting}
            exportLabel={exportLabel}
            exportingLabel={exportingLabel}
          />
        )}
      </div>

      {/* table scroll 영역 — 부모의 남은 height을 모두 차지.
          windowedPagination=true: overflow-hidden (내부 스크롤 X, viewport-fit).
          windowedPagination=false(기본): overflow-auto (내부 스크롤, 기존 동작). */}
      <div
        ref={tableWrapperRef}
        className={[
          "min-h-0 flex-1 rounded border border-(--border-default)",
          windowedPagination ? "overflow-hidden" : "overflow-auto",
        ].join(" ")}
      >
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-(--bg-page) text-[11px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
            {groupHeaders && groupHeaders.length > 0 ? (
              <tr
                data-testid="group-header-row"
                className="border-b border-(--border-default) bg-(--bg-page)"
              >
                {/* No + 삭제 컬럼 leading. readOnly이면 No만 (삭제 컬럼 hide). */}
                <th
                  className="w-10 px-2 py-2"
                  aria-hidden
                  colSpan={readOnly ? 1 : 2}
                />
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
                  No=44px, 삭제=56px(readOnly 시 hide), 상태=64px 최소폭 보장. */}
              <th className="w-11 whitespace-nowrap px-2 py-2 text-left">{t("no")}</th>
              {!readOnly && (
                <th className="w-14 whitespace-nowrap px-2 py-2 text-center">{t("delete")}</th>
              )}
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
            {/*
              per-column filter row — filters가 비어있으면 빈 행만 렌더되어
              컬럼 헤더와 첫 데이터 행 사이에 공백 줄이 보이는 시각 버그가
              생긴다. 검색은 보통 GridSearchForm(컬럼 헤더 위 카드)이 담당하고
              per-column row는 거의 안 쓰므로, 명시적으로 filters가 있을 때만
              렌더해 빈 행 노출 회귀를 차단.
            */}
            {filters.length > 0 && (
              <ColumnFilterRow<T>
                filters={filters}
                values={filterValues}
                onChange={handleFilterChange}
                leadingCols={readOnly ? 1 : 2}
              />
            )}
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (readOnly ? 2 : 3)}
                  className="px-4 py-12 text-center text-sm text-(--fg-muted)"
                >
                  {resolvedEmpty}
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => (
                <tr
                  key={r.data.id}
                  data-row-status={r.state}
                  onClick={() => handleRowSelect(r.data.id)}
                  onDoubleClick={() => onRowDoubleClick?.(r.data)}
                  className={[
                    "border-b border-(--border-default) transition-colors duration-150",
                    "hover:bg-(--bg-page)",
                    selected === r.data.id ? "bg-blue-50/40" : "",
                    r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                    r.state === "new" ? "bg-blue-50/40" : "",
                    r.state === "dirty" ? "bg-amber-50/40" : "",
                  ].join(" ")}
                >
                  <td className="h-8 w-11 whitespace-nowrap px-2 align-middle text-[12px] text-(--fg-muted)">
                    {(page - 1) * limit + i + 1}
                  </td>
                  {/* 삭제 체크박스 — readOnly 모드에서는 hide. */}
                  {!readOnly && (
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
                  )}
                  {columns.map((col) => {
                    const val = (r.data as Record<string, unknown>)[col.key];
                    const commit = (v: unknown) =>
                      grid.update(r.data.id, col.key as keyof T, v as T[keyof T]);

                    // 셀 편집 가능 여부 — 세 조건 모두 만족해야 editable:
                    //   1. 그리드 전체 readOnly가 아님
                    //   2. col.editable === true
                    //   3. lockOnExisting + 기존(saved) 행이 아님
                    // 셋 중 하나라도 false면 readonly 분기로 렌더.
                    const isLocked = col.lockOnExisting === true && r.state !== "new";
                    const cellEditable = !readOnly && col.editable === true && !isLocked;

                    if (col.type === "readonly" || !cellEditable) {
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
                        {col.editor
                          ? col.editor({ row: r.data, value: val, commit, disabled: false })
                          : col.type === "text"
                            ? (
                              <EditableTextCell
                                value={val as string | null}
                                onCommit={commit}
                                required={col.required}
                              />
                            )
                            : col.type === "textarea"
                              ? (
                                <EditableTextAreaCell
                                  value={val as string | null}
                                  onCommit={commit}
                                  required={col.required}
                                />
                              )
                              : col.type === "select"
                                ? (
                                  <EditableSelectCell
                                    value={val as string | null}
                                    options={col.options ?? []}
                                    onCommit={commit}
                                    required={col.required}
                                  />
                                )
                                : col.type === "date"
                                  ? (
                                    <EditableDateCell
                                      value={val as string | null}
                                      onCommit={commit}
                                    />
                                  )
                                  : col.type === "boolean"
                                    ? (
                                      <EditableBooleanCell
                                        value={Boolean(val)}
                                        onCommit={commit}
                                      />
                                    )
                                    : col.type === "numeric" && col.integer === true
                                      ? (
                                        <EditableNumericCell
                                          mode="integer"
                                          value={
                                            val === null || val === undefined || val === ""
                                              ? null
                                              : Number(val)
                                          }
                                          onChange={(next) =>
                                            commit(next === null ? null : next)
                                          }
                                        />
                                      )
                                      : col.type === "numeric"
                                        ? (
                                          <EditableNumericCell
                                            mode="decimal"
                                            value={
                                              val === null || val === undefined || val === ""
                                                ? null
                                                : String(val)
                                            }
                                            onChange={(next) => commit(next)}
                                          />
                                        )
                                        : null}
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
