"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeGroupGrid.tsx
 *
 * 공통코드 — 그룹코드(master) 그리드.
 *
 * 컬럼: No / 삭제 / 상태 / *그룹코드 / *코드명 / 코드설명(textarea) /
 *       업무구분 / 구분 / 세부 코드수
 * (legacy grpCdMgr.jsp 기준, screenshot 컬럼 순서 유지)
 *
 * **하이브리드 채택 — `<DataGrid>` 풀 도입 X. 이유:**
 *
 *   1) `<DataGrid>` 는 `useGridState`를 내부에서 소유한다. 본 화면은 부모
 *      `CodesPageClient`가 master/detail 두 grid의 상태를 동시에 보유하면서
 *      a) detail dirty 상태로 master 행 선택을 게이트하고
 *      b) detail 저장 후 master를 reload(subCnt 갱신)하며
 *      c) master row 선택을 detail의 그룹 필터로 전달
 *      해야 하므로 grid 상태가 외부에 있어야 한다.
 *   2) 그룹코드(`code`) 컬럼은 `r.state === "new"` 일 때만 편집 가능하다
 *      (legacy KeyField:1 의미). `ColumnDef<T>` 의 `editable: boolean`은
 *      행 단위 조건부를 지원하지 않는다 → `lockOnExisting` flag로 확장.
 *   3) `<DataGrid>` 는 `onExport` 슬롯, 행 선택 콜백(`onRowClick`),
 *      커스텀 필터 폼(검색 버튼 기반) 슬롯이 없다.
 *
 * **그래도 선언형(`ColumnDef[]`)으로 옮긴 부분:**
 *
 *   - 컬럼 메타(label/key/type/width)를 `COLUMNS` 배열로 단일 정의.
 *   - 본문 `<td>`는 `COLUMNS.map(...)` 으로 렌더 — 각 컬럼별 cell 컴포넌트
 *     스위치는 한 군데로 모음.
 *   - Excel export 헤더는 `COLUMNS`에서 `(key, label)` 쌍을 그대로 추출.
 *
 * 향후 `<DataGrid>`가 (a) 외부 grid prop, (b) 행 단위 readOnly,
 * (c) `onExport`/`onRowClick` 슬롯을 노출하면 본 파일을 5~10줄로 줄일 수 있다.
 */
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableTextAreaCell } from "@/components/grid/cells/EditableTextAreaCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/components/grid/types";
import type { CodeGroupRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeGroupRow>>;

/**
 * `ColumnDef`를 확장한 master grid 전용 메타.
 * `lockOnExisting` 은 `<DataGrid>` 표준에 없으므로 본 그리드 안에서만 해석한다.
 */
type CodeGroupColumnDef = ColumnDef<CodeGroupRow> & {
  /** 기존 행에서 readOnly로 표시할지 (legacy KeyField:1, UpdateEdit:0). */
  lockOnExisting?: boolean;
};

// Kind option *values* are stable enums; *labels* are i18n'd in the component.
const KIND_OPTION_VALUES = ["C", "N"] as const;

type FilterValues = {
  q: string;
  qName: string;
  includesDetailCodeNm: string;
  kind: string;
};

type BusinessDivOption = { code: string; label: string };

type Props = {
  grid: GridApi;
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  saving: boolean;
  onInsert: () => void;
  onCopy: () => void;
  onSave: () => void;
  onExport: () => void;
  /** BIZ_DIVISION 코드 그룹의 활성 항목 (RSC에서 주입). */
  businessDivOptions: BusinessDivOption[];
};

export function CodeGroupGrid({
  grid,
  total,
  selectedId,
  onSelect,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onResetFilters,
  saving,
  onInsert,
  onCopy,
  onSave,
  onExport,
  businessDivOptions,
}: Props) {
  const t = useTranslations("Admin.Codes.groupSection");
  const update = useCallback(
    <K extends keyof CodeGroupRow>(id: string, key: K, value: CodeGroupRow[K]) =>
      grid.update(id, key, value),
    [grid],
  );

  const KIND_OPTIONS = useMemo(
    () =>
      KIND_OPTION_VALUES.map((value) => ({
        value,
        label: value === "C" ? t("filter.kindUser") : t("filter.kindSystem"),
      })),
    [t],
  );

  const BIZ_DIV_OPTIONS = useMemo(
    () => businessDivOptions.map((o) => ({ value: o.code, label: o.label })),
    [businessDivOptions],
  );

  // Declarative column spec. 본문 렌더와 Excel export가 모두 이 배열을 사용한다.
  const COLUMNS: CodeGroupColumnDef[] = useMemo(
    () => [
      {
        key: "code",
        label: `*${t("columns.code")}`,
        type: "text",
        width: 160,
        editable: true,
        required: true,
        lockOnExisting: true,
      },
      {
        key: "name",
        label: `*${t("columns.name")}`,
        type: "text",
        width: 220,
        editable: true,
        required: true,
      },
      {
        key: "description",
        label: t("columns.description"),
        type: "textarea",
        width: 280,
        editable: true,
      },
      {
        key: "businessDivCode",
        label: t("columns.businessDiv"),
        type: "select",
        width: 140,
        editable: true,
        options: BIZ_DIV_OPTIONS,
      },
      {
        key: "kindCode",
        label: t("columns.kind"),
        type: "select",
        width: 120,
        editable: true,
        required: true,
        options: KIND_OPTIONS,
      },
      {
        key: "subCnt",
        label: t("columns.subCnt"),
        type: "numeric",
        width: 100,
        editable: false, // readonly count
      },
    ],
    [t, BIZ_DIV_OPTIONS, KIND_OPTIONS],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">
          {t("title")} — {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <GridToolbar
            dirtyCount={grid.dirtyCount}
            saving={saving}
            onInsert={onInsert}
            onCopy={onCopy}
            onSave={onSave}
          />
          <Button size="sm" variant="outline" onClick={onExport} disabled={saving}>
            {t("toolbar.export")}
          </Button>
        </div>
      </div>

      {/* Filter row */}
      <form
        className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50/50 px-2 py-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onApplyFilters();
        }}
      >
        <input
          type="text"
          placeholder={t("filter.code")}
          value={draftFilters.q}
          onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
          className="h-8 w-40 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder={t("filter.name")}
          value={draftFilters.qName}
          onChange={(e) =>
            onDraftFilterChange({ ...draftFilters, qName: e.target.value })
          }
          className="h-8 w-48 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder={t("filter.includesDetailCodeNmPlaceholder")}
          value={draftFilters.includesDetailCodeNm}
          onChange={(e) =>
            onDraftFilterChange({
              ...draftFilters,
              includesDetailCodeNm: e.target.value,
            })
          }
          className="h-8 w-48 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={draftFilters.kind}
          onChange={(e) =>
            onDraftFilterChange({ ...draftFilters, kind: e.target.value })
          }
          className="h-8 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">
            {t("filter.kind")} ({t("filter.kindAll")})
          </option>
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          {t("filter.search")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}>
          {t("filter.reset")}
        </Button>
      </form>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">{t("columns.no")}</th>
              <th className="w-10 px-2 py-2">{t("columns.delete")}</th>
              <th className="w-16 px-2 py-2 text-left">{t("columns.status")}</th>
              {COLUMNS.map((col) => (
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
            </tr>
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => {
                const row = r.data;
                const isSelected = row.id === selectedId;
                const isNew = r.state === "new";
                return (
                  <tr
                    key={row.id}
                    data-row-status={r.state}
                    onClick={() => onSelect(row.id)}
                    className={[
                      "cursor-pointer border-b border-slate-100 transition-colors duration-150",
                      "hover:bg-slate-50",
                      r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                      r.state === "new" ? "bg-blue-50/40" : "",
                      r.state === "dirty" ? "bg-amber-50/40" : "",
                      isSelected ? "ring-2 ring-blue-400 ring-inset" : "",
                    ].join(" ")}
                  >
                    <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                      {i + 1}
                    </td>
                    <td
                      className="h-8 w-10 px-2 text-center align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    <td className="h-8 w-16 px-2 align-middle">
                      <RowStatusBadge state={r.state} />
                    </td>
                    {COLUMNS.map((col) => {
                      const val = row[col.key];
                      const lockedExisting = col.lockOnExisting && !isNew;
                      const editable = col.editable !== false && !lockedExisting;
                      const cellClass = "h-8 p-0 align-middle";
                      const stop = (e: React.MouseEvent) => e.stopPropagation();

                      // Read-only display (lockOnExisting on existing row OR editable=false)
                      if (!editable) {
                        if (col.type === "numeric") {
                          const n =
                            typeof val === "number"
                              ? val
                              : val === null || val === undefined
                                ? null
                                : Number(val);
                          return (
                            <td
                              key={col.key}
                              className="h-8 px-2 align-middle text-right text-[13px] tabular-nums text-slate-700"
                              data-col={col.key}
                              data-cell-value={n === null ? "" : String(n)}
                            >
                              {n === null ? "" : n.toLocaleString()}
                            </td>
                          );
                        }
                        // lockOnExisting text (e.g. 그룹코드 on existing rows)
                        return (
                          <td
                            key={col.key}
                            className={cellClass}
                            data-col={col.key}
                            data-cell-value={String(val ?? "")}
                            onClick={stop}
                          >
                            <div className="px-2 py-1 text-[13px] font-mono text-slate-900">
                              {String(val ?? "")}
                            </div>
                          </td>
                        );
                      }

                      // Editable cells — branch by type
                      return (
                        <td
                          key={col.key}
                          className={cellClass}
                          data-col={col.key}
                          data-cell-value={String(val ?? "")}
                          onClick={stop}
                        >
                          {col.type === "text" && (
                            <EditableTextCell
                              value={(val as string | null) || null}
                              onCommit={(v) =>
                                update(
                                  row.id,
                                  col.key,
                                  (col.required ? (v ?? "") : v) as CodeGroupRow[typeof col.key],
                                )
                              }
                              required={col.required}
                            />
                          )}
                          {col.type === "textarea" && (
                            <EditableTextAreaCell
                              value={val as string | null}
                              onCommit={(v) =>
                                update(row.id, col.key, v as CodeGroupRow[typeof col.key])
                              }
                              required={col.required}
                            />
                          )}
                          {col.type === "select" && (
                            <EditableSelectCell
                              value={(val as string | null) || null}
                              options={col.options ?? []}
                              onCommit={(v) =>
                                update(
                                  row.id,
                                  col.key,
                                  (col.required && col.key === "kindCode"
                                    ? (v ?? "C")
                                    : v) as CodeGroupRow[typeof col.key],
                                )
                              }
                              required={col.required}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Excel export용 컬럼 메타 추출 헬퍼.
 *
 * `CodesPageClient`가 `exportToExcel({ columns, ... })`를 호출할 때 사용한다.
 * 여기서 `code`/`name`의 라벨에 붙는 `*` 마커는 표 헤더에서만 의미가 있어 제거.
 */
export function getCodeGroupExportColumns(t: (k: string) => string) {
  return [
    { key: "code", header: t("columns.code") },
    { key: "name", header: t("columns.name") },
    { key: "description", header: t("columns.description") },
    { key: "businessDivCode", header: t("columns.businessDiv") },
    { key: "kindCode", header: t("columns.kind") },
    { key: "subCnt", header: t("columns.subCnt") },
  ] as const;
}
