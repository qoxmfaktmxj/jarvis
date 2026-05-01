"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeItemGrid.tsx
 *
 * 공통코드 — 세부코드(detail) 그리드.
 *
 * 컬럼: No / 삭제 / 상태 / *세부코드 / 세부코드명 / 순서 / 사용유무 / 영문명 /
 *       비고1~9 / 비고(숫자형) / *시작일 / *종료일
 *
 * Custom-table 패턴(InfraLicensesGrid mirror) 사용 — 이유:
 *   1) sortOrder/numNote 가 EditableNumericCell이 필요한데 공유 <DataGrid>는
 *      type="text|select|date|boolean|readonly"만 지원함 (numeric type 부재).
 *   2) 비고1~9 + 그 외 메타가 12+ 컬럼이라 가로 스크롤 + sticky 헤더가 더 잘 맞음.
 *
 * 사용유무는 boolean(`isActive`)이고 EditableBooleanCell 체크박스로 렌더한다.
 * (스펙의 'Y/N select 변환'은 wrapper 비용이 더 높아 boolean 직결로 단순화 — 화면
 *  의미는 동일.)
 *
 * 세부코드(`code`)는 신규 행에서만 편집 가능 (legacy KeyField:1 의미).
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { Button } from "@/components/ui/button";
import type { CodeItemRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeItemRow>>;

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

  // 비고1~9 헬퍼
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
  ] as const;

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
              <th className="px-2 py-2 text-left" style={{ minWidth: 140 }}>
                *{t("columns.code")}
              </th>
              <th className="px-2 py-2 text-left" style={{ minWidth: 200 }}>
                {t("columns.name")}
              </th>
              <th className="px-2 py-2 text-right" style={{ minWidth: 80 }}>
                {t("columns.sortOrder")}
              </th>
              <th className="px-2 py-2 text-center" style={{ minWidth: 90 }}>
                {t("columns.useYn")}
              </th>
              <th className="px-2 py-2 text-left" style={{ minWidth: 160 }}>
                {t("columns.nameEn")}
              </th>
              {NOTE_KEYS.map((k, idx) => (
                <th
                  key={k}
                  className="px-2 py-2 text-left"
                  style={{ minWidth: 140 }}
                >
                  {t("columns.note", { n: idx + 1 })}
                </th>
              ))}
              <th className="px-2 py-2 text-right" style={{ minWidth: 110 }}>
                {t("columns.numNote")}
              </th>
              <th className="px-2 py-2 text-left" style={{ minWidth: 140 }}>
                *{t("columns.sdate")}
              </th>
              <th className="px-2 py-2 text-left" style={{ minWidth: 140 }}>
                *{t("columns.edate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {!selectedGroupId ? (
              <tr>
                <td colSpan={20} className="px-4 py-12 text-center text-sm text-slate-400">
                  {t("emptyMaster")}
                </td>
              </tr>
            ) : grid.rows.length === 0 ? (
              <tr>
                <td colSpan={20} className="px-4 py-12 text-center text-sm text-slate-500">
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
                    {/* 세부코드 — edit only when new */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="code"
                      data-cell-value={row.code}
                    >
                      {isNew ? (
                        <EditableTextCell
                          value={row.code || null}
                          onCommit={(v) => update(row.id, "code", v ?? "")}
                          required
                        />
                      ) : (
                        <div className="px-2 py-1 text-[13px] font-mono text-slate-900">
                          {row.code}
                        </div>
                      )}
                    </td>
                    {/* 세부코드명 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="name"
                      data-cell-value={row.name}
                    >
                      <EditableTextCell
                        value={row.name || null}
                        onCommit={(v) => update(row.id, "name", v ?? "")}
                        required
                      />
                    </td>
                    {/* 순서 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="sortOrder"
                      data-cell-value={String(row.sortOrder)}
                    >
                      <EditableNumericCell
                        value={row.sortOrder}
                        onChange={(v) => update(row.id, "sortOrder", v ?? 0)}
                      />
                    </td>
                    {/* 사용유무 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="isActive"
                      data-cell-value={String(row.isActive)}
                    >
                      <EditableBooleanCell
                        value={row.isActive}
                        onCommit={(v) => update(row.id, "isActive", v)}
                      />
                    </td>
                    {/* 영문명 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="nameEn"
                      data-cell-value={row.nameEn ?? ""}
                    >
                      <EditableTextCell
                        value={row.nameEn}
                        onCommit={(v) => update(row.id, "nameEn", v)}
                      />
                    </td>
                    {/* 비고1~9 */}
                    {NOTE_KEYS.map((k) => (
                      <td
                        key={k}
                        className="h-8 p-0 align-middle"
                        data-col={k}
                        data-cell-value={row[k] ?? ""}
                      >
                        <EditableTextCell
                          value={row[k]}
                          onCommit={(v) => update(row.id, k, v)}
                        />
                      </td>
                    ))}
                    {/* 비고(숫자형) */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="numNote"
                      data-cell-value={row.numNote === null ? "" : String(row.numNote)}
                    >
                      <EditableNumericCell
                        value={row.numNote}
                        onChange={(v) => update(row.id, "numNote", v)}
                      />
                    </td>
                    {/* 시작일 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="sdate"
                      data-cell-value={row.sdate}
                    >
                      <EditableDateCell
                        value={row.sdate}
                        onCommit={(v) => update(row.id, "sdate", v ?? "1900-01-01")}
                      />
                    </td>
                    {/* 종료일 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="edate"
                      data-cell-value={row.edate}
                    >
                      <EditableDateCell
                        value={row.edate}
                        onCommit={(v) => update(row.id, "edate", v ?? "2999-12-31")}
                      />
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
