"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeItemGrid.tsx
 *
 * 공통코드 — 세부코드(detail) 그리드.
 *
 * 컬럼: No / 삭제 / *세부코드 / 세부코드명 / 순서 / 사용유무 /
 *       영문명 / 비고1~9 / 비고(숫자형) / *시작일 / *종료일 / 상태
 *
 * DataGrid 베이스라인 미사용 이유 (CodeGroupGrid 주석 참고 + detail 고유 사정):
 *   - selectedGroupId === null 일 때 빈 안내 표시 / 폼 전체 비활성화.
 *   - 14+ 컬럼 → 가로 스크롤 + sticky 헤더 필요.
 *   - code 컬럼은 신규 행에서만 편집 가능 (legacy KeyField:1).
 *
 * 필터: GridSearchForm + GridFilterField (baseline 표준 컴포넌트).
 * 툴바: GridToolbar(입력/복사/저장) + DataGridToolbar(다운로드).
 */
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableTextAreaCell } from "@/components/grid/cells/EditableTextAreaCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import type { ColumnDef } from "@/components/grid/types";
import type { CodeItemRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeItemRow>>;

type CodeItemColumnDef = ColumnDef<CodeItemRow> & {
  lockOnExisting?: boolean;
};

const NOTE_KEYS = [
  "note1",
  "note2",
  "note3",
  "note4",
  "note5",
  "note6",
  "note7",
  "note8",
  "note9",
] as const satisfies readonly (keyof CodeItemRow & string)[];

/** input / select 공통 className (baseline 표준) */
const INPUT_CLS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

type FilterValues = {
  q: string;
  qName: string;
  useYn: string;
};

type Props = {
  grid: GridApi;
  total: number;
  selectedGroupId: string | null;
  selectedGroupCode: string | null;
  selectedGroupName: string | null;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  saving: boolean;
  onInsert: () => void;
  onCopy: () => void;
  onSave: () => void;
  onExport: () => void;
};

export function CodeItemGrid({
  grid,
  total,
  selectedGroupId,
  selectedGroupCode,
  selectedGroupName,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onResetFilters,
  saving,
  onInsert,
  onCopy,
  onSave,
  onExport,
}: Props) {
  const t = useTranslations("Admin.Codes.itemSection");
  const update = useCallback(
    <K extends keyof CodeItemRow>(id: string, key: K, value: CodeItemRow[K]) =>
      grid.update(id, key, value),
    [grid],
  );

  const disabled = !selectedGroupId;

  const COLUMNS: CodeItemColumnDef[] = useMemo(() => {
    const noteCols: CodeItemColumnDef[] = NOTE_KEYS.map((k, idx) => ({
      key: k,
      label: t("columns.note", { n: idx + 1 }),
      type: "textarea",
      width: 140,
      editable: true,
    }));
    return [
      {
        key: "code",
        label: `*${t("columns.code")}`,
        type: "text",
        width: 140,
        editable: true,
        required: true,
        lockOnExisting: true,
      },
      {
        key: "name",
        label: t("columns.name"),
        type: "text",
        width: 200,
        editable: true,
        required: true,
      },
      {
        key: "sortOrder",
        label: t("columns.sortOrder"),
        type: "numeric",
        width: 80,
        editable: true,
      },
      {
        key: "isActive",
        label: t("columns.useYn"),
        type: "boolean",
        width: 90,
        editable: true,
      },
      {
        key: "nameEn",
        label: t("columns.nameEn"),
        type: "text",
        width: 160,
        editable: true,
      },
      ...noteCols,
      {
        key: "numNote",
        label: t("columns.numNote"),
        type: "numeric",
        width: 110,
        editable: true,
      },
      {
        key: "sdate",
        label: `*${t("columns.sdate")}`,
        type: "date",
        width: 140,
        editable: true,
        required: true,
      },
      {
        key: "edate",
        label: `*${t("columns.edate")}`,
        type: "date",
        width: 140,
        editable: true,
        required: true,
      },
    ];
  }, [t]);

  // Detail title with group info
  const titleNode = (
    <span className="text-sm text-slate-600">
      {t("title")}
      {selectedGroupId ? (
        <>
          {" — "}
          <span className="font-mono text-slate-800">{selectedGroupCode}</span>
          {selectedGroupName ? (
            <span className="text-slate-500"> · {selectedGroupName}</span>
          ) : null}
          {" — "}
          {total.toLocaleString()}
        </>
      ) : (
        <span className="ml-1 text-slate-400">({t("emptyMaster")})</span>
      )}
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <DataGridToolbar
        onExport={disabled ? undefined : onExport}
        exportLabel={t("toolbar.export")}
        isExporting={saving}
      >
        {titleNode}
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
        isSearching={saving || disabled}
        searchLabel={t("filter.search")}
        resetLabel={t("filter.reset")}
      >
        <GridFilterField label={t("filter.code")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.name")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.qName}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, qName: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.useYn")} className="w-[140px]">
          <select
            value={draftFilters.useYn}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, useYn: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          >
            <option value="">{t("filter.useYnAll")}</option>
            <option value="Y">{t("filter.useY")}</option>
            <option value="N">{t("filter.useN")}</option>
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
                    col.type === "numeric"
                      ? "text-right"
                      : col.type === "boolean"
                        ? "text-center"
                        : "text-left",
                  ].join(" ")}
                  style={col.width ? { minWidth: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-16 px-2 py-2 text-left">상태</th>
            </tr>
          </thead>
          <tbody>
            {!selectedGroupId ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-4 py-12 text-center text-sm text-slate-400"
                >
                  {t("emptyMaster")}
                </td>
              </tr>
            ) : grid.rows.length === 0 ? (
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
                const isNew = r.state === "new";
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
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                      {i + 1}
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
                    {COLUMNS.map((col) => {
                      const val = row[col.key];
                      const isLocked = col.lockOnExisting && !isNew;
                      const editable = col.editable !== false && !isLocked;
                      const cellClass = "h-8 p-0 align-middle";

                      if (isLocked) {
                        return (
                          <td
                            key={col.key}
                            className={cellClass}
                            data-col={col.key}
                            data-cell-value={String(val ?? "")}
                          >
                            <div className="px-2 py-1 text-[13px] font-mono text-slate-900">
                              {String(val ?? "")}
                            </div>
                          </td>
                        );
                      }

                      if (!editable) {
                        return (
                          <td
                            key={col.key}
                            className="h-8 px-2 align-middle text-[13px] text-slate-700"
                            data-col={col.key}
                            data-cell-value={String(val ?? "")}
                          >
                            {String(val ?? "")}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={cellClass}
                          data-col={col.key}
                          data-cell-value={val == null ? "" : String(val)}
                        >
                          {col.type === "text" && (
                            <EditableTextCell
                              value={(val as string | null) || null}
                              onCommit={(v) =>
                                update(
                                  row.id,
                                  col.key,
                                  (col.required ? (v ?? "") : v) as CodeItemRow[typeof col.key],
                                )
                              }
                              required={col.required}
                            />
                          )}
                          {col.type === "textarea" && (
                            <EditableTextAreaCell
                              value={val as string | null}
                              onCommit={(v) =>
                                update(row.id, col.key, v as CodeItemRow[typeof col.key])
                              }
                              required={col.required}
                            />
                          )}
                          {col.type === "numeric" && (
                            <EditableNumericCell
                              value={
                                val == null || val === "" ? null : Number(val)
                              }
                              onChange={(v) => {
                                const next = col.key === "sortOrder" ? (v ?? 0) : v;
                                update(
                                  row.id,
                                  col.key,
                                  next as CodeItemRow[typeof col.key],
                                );
                              }}
                            />
                          )}
                          {col.type === "boolean" && (
                            <EditableBooleanCell
                              value={Boolean(val)}
                              onCommit={(v) =>
                                update(row.id, col.key, v as CodeItemRow[typeof col.key])
                              }
                            />
                          )}
                          {col.type === "date" && (
                            <EditableDateCell
                              value={val as string | null}
                              onCommit={(v) => {
                                const fallback =
                                  col.key === "sdate" ? "1900-01-01" : "2999-12-31";
                                update(
                                  row.id,
                                  col.key,
                                  (v ?? fallback) as CodeItemRow[typeof col.key],
                                );
                              }}
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
 */
export function getCodeItemExportColumns(
  t: (key: string, vars?: Record<string, string | number | Date>) => string,
) {
  return [
    { key: "code", header: t("columns.code") },
    { key: "name", header: t("columns.name") },
    { key: "sortOrder", header: t("columns.sortOrder") },
    { key: "isActive", header: t("columns.useYn") },
    { key: "nameEn", header: t("columns.nameEn") },
    { key: "note1", header: t("columns.note", { n: 1 }) },
    { key: "note2", header: t("columns.note", { n: 2 }) },
    { key: "note3", header: t("columns.note", { n: 3 }) },
    { key: "note4", header: t("columns.note", { n: 4 }) },
    { key: "note5", header: t("columns.note", { n: 5 }) },
    { key: "note6", header: t("columns.note", { n: 6 }) },
    { key: "note7", header: t("columns.note", { n: 7 }) },
    { key: "note8", header: t("columns.note", { n: 8 }) },
    { key: "note9", header: t("columns.note", { n: 9 }) },
    { key: "numNote", header: t("columns.numNote") },
    { key: "sdate", header: t("columns.sdate") },
    { key: "edate", header: t("columns.edate") },
  ] as const;
}
