"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeGroupGrid.tsx
 *
 * 공통코드 — 그룹코드(master) 그리드.
 *
 * 컬럼: No / 삭제 / *그룹코드 / *코드명 / 코드설명 / 업무구분 / 구분 / 세부코드수 / 상태
 *
 * DataGrid 베이스라인 미사용 이유:
 *   - 부모 CodesPageClient가 master/detail 상태를 동시에 보유해야 함
 *     (detail dirty 게이트 + detail 저장 후 master reload).
 *   - code 컬럼은 신규 행에서만 편집 가능 (legacy KeyField:1).
 *   - DataGrid는 row-click 콜백·외부 grid state를 노출하지 않음.
 *
 * 필터: GridSearchForm + GridFilterField (baseline 표준 컴포넌트).
 * 툴바: GridToolbar(입력/복사/저장) + DataGridToolbar(다운로드).
 */
import { type MouseEvent, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableTextAreaCell } from "@/components/grid/cells/EditableTextAreaCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import type { ColumnDef } from "@/components/grid/types";
import type { CodeGroupRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeGroupRow>>;

/** master grid 전용 — lockOnExisting: 기존 행의 code 컬럼을 읽기 전용으로 표시. */
type CodeGroupColumnDef = ColumnDef<CodeGroupRow> & {
  lockOnExisting?: boolean;
};

const KIND_OPTION_VALUES = ["C", "N"] as const;

/** input / select 공통 className (baseline 표준) */
const INPUT_CLS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

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
        editable: false,
      },
    ],
    [t, BIZ_DIV_OPTIONS, KIND_OPTIONS],
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <DataGridToolbar
        onExport={onExport}
        exportLabel={t("toolbar.export")}
        isExporting={saving}
      >
        <span className="text-sm text-slate-600">
          {t("title")} — {total.toLocaleString()}
        </span>
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={onInsert}
          onCopy={onCopy}
          onSave={onSave}
        />
      </DataGridToolbar>

      {/* Search form */}
      <GridSearchForm
        onSearch={onApplyFilters}
        onReset={onResetFilters}
        isSearching={saving}
        searchLabel={t("filter.search")}
        resetLabel={t("filter.reset")}
      >
        <GridFilterField label={t("filter.code")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.name")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.qName}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, qName: e.target.value })}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField
          label={t("filter.includesDetailCodeNmPlaceholder")}
          className="w-[140px]"
        >
          <input
            type="text"
            value={draftFilters.includesDetailCodeNm}
            onChange={(e) =>
              onDraftFilterChange({ ...draftFilters, includesDetailCodeNm: e.target.value })
            }
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.kind")} className="w-[140px]">
          <select
            value={draftFilters.kind}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, kind: e.target.value })}
            className={INPUT_CLS}
          >
            <option value="">{t("filter.kindAll")}</option>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
      </GridSearchForm>

      {/* Grid */}
      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">No</th>
              <th className="w-10 px-2 py-2">삭제</th>
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
              <th className="w-16 px-2 py-2 text-left">상태</th>
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
                    ]
                      .filter(Boolean)
                      .join(" ")}
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
                    {COLUMNS.map((col) => {
                      const val = row[col.key];
                      const isLocked = col.lockOnExisting && !isNew;
                      const editable = col.editable !== false && !isLocked;
                      const stop = (e: MouseEvent) => e.stopPropagation();

                      if (!editable) {
                        if (col.type === "numeric") {
                          const n = typeof val === "number" ? val : val == null ? null : Number(val);
                          return (
                            <td
                              key={col.key}
                              data-col={col.key}
                              data-cell-value={n == null ? "" : String(n)}
                              className="h-8 px-2 align-middle text-right text-[13px] tabular-nums text-slate-700"
                            >
                              {n == null ? "" : n.toLocaleString()}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.key}
                            data-col={col.key}
                            data-cell-value={String(val ?? "")}
                            className="h-8 p-0 align-middle"
                            onClick={stop}
                          >
                            <div className="px-2 py-1 text-[13px] font-mono text-slate-900">
                              {String(val ?? "")}
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          data-col={col.key}
                          data-cell-value={String(val ?? "")}
                          className="h-8 p-0 align-middle"
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
    </div>
  );
}

/**
 * Excel export용 컬럼 메타 추출 헬퍼.
 * CodesPageClient가 exportToExcel({ columns, ... })를 호출할 때 사용한다.
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
