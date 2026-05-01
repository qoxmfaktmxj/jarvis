"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeItemGrid.tsx
 *
 * 공통코드 — 세부코드(detail) 그리드.
 *
 * 컬럼: No / 삭제 / 상태 / *세부코드 / 세부코드명 / 순서(numeric) / 사용유무(boolean) /
 *       영문명 / 비고1~9(textarea) / 비고(숫자형, numeric) / *시작일 / *종료일
 *
 * **하이브리드 채택 — `<DataGrid>` 풀 도입 X. 사유는 `CodeGroupGrid` 헤더 참고.**
 *
 *   추가로 detail-grid 고유 사정:
 *   1) `selectedGroupId === null` 일 때 그리드 전체가 disabled 상태로
 *      "그룹코드를 먼저 선택하세요" 안내를 표시한다 (`<DataGrid>` 미지원).
 *   2) 비고1~9 + 메타까지 14+ 컬럼이라 가로 스크롤 + sticky 헤더가 필요하다.
 *
 * **선언형(`ColumnDef[]`)으로 옮긴 부분:**
 *
 *   - 컬럼 메타(label/key/type/width)를 `COLUMNS` 배열로 단일 정의
 *     (legacy 비고1~9 반복도 generate해 9줄 → 1 loop).
 *   - 본문 `<td>`는 `COLUMNS.map(...)` 으로 렌더.
 *   - Excel export 헤더는 `COLUMNS`에서 `(key, label)` 쌍을 그대로 추출.
 */
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableTextAreaCell } from "@/components/grid/cells/EditableTextAreaCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/components/grid/types";
import type { CodeItemRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeItemRow>>;

/** detail grid 전용 메타 — `lockOnExisting`는 `<DataGrid>` 표준 외 확장. */
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

  // Declarative column spec.
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
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
            <span className="ml-1 text-slate-400">
              ({t("emptyMaster")})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <GridToolbar
            dirtyCount={grid.dirtyCount}
            saving={saving}
            onInsert={onInsert}
            onCopy={onCopy}
            onSave={onSave}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            disabled={saving || disabled}
          >
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
          disabled={disabled}
          className="h-8 w-40 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <input
          type="text"
          placeholder={t("filter.name")}
          value={draftFilters.qName}
          onChange={(e) =>
            onDraftFilterChange({ ...draftFilters, qName: e.target.value })
          }
          disabled={disabled}
          className="h-8 w-48 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <select
          value={draftFilters.useYn}
          onChange={(e) =>
            onDraftFilterChange({ ...draftFilters, useYn: e.target.value })
          }
          disabled={disabled}
          className="h-8 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        >
          <option value="">
            {t("filter.useYn")} ({t("filter.useYnAll")})
          </option>
          <option value="Y">{t("filter.useY")}</option>
          <option value="N">{t("filter.useN")}</option>
        </select>
        <Button type="submit" size="sm" disabled={disabled}>
          {t("filter.search")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onResetFilters}
          disabled={disabled}
        >
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
                    ].join(" ")}
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
                    <td className="h-8 w-16 px-2 align-middle">
                      <RowStatusBadge state={r.state} />
                    </td>
                    {COLUMNS.map((col) => {
                      const val = row[col.key];
                      const lockedExisting = col.lockOnExisting && !isNew;
                      const editable = col.editable !== false && !lockedExisting;
                      const cellClass = "h-8 p-0 align-middle";

                      if (lockedExisting) {
                        // text key (e.g. 세부코드) display-only
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
                        // not used in detail (no readonly numeric here), but keep symmetry
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
                          data-cell-value={
                            val === null || val === undefined ? "" : String(val)
                          }
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
                                val === null || val === undefined || val === ""
                                  ? null
                                  : Number(val)
                              }
                              onChange={(v) => {
                                // sortOrder is non-null in CodeItemRow → fall back to 0
                                const next =
                                  col.key === "sortOrder" ? (v ?? 0) : v;
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
                                // sdate/edate are non-null with legacy default ranges
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
                          {/* type === "select" 는 detail grid에서 사용하지 않음. */}
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
 * 라벨에 붙는 `*` 마커는 제거.
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
