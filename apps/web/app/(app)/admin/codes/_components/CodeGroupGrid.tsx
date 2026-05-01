"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeGroupGrid.tsx
 *
 * 공통코드 — 그룹코드(master) 그리드.
 * 행 클릭 시 selectedGroupId가 변경되어 detail 그리드가 다시 fetch한다.
 *
 * 컬럼: No / 삭제 / 상태 / *그룹코드 / *코드명 / 코드설명 / 업무구분 / 구분 / 세부 코드수
 * (legacy grpCdMgr.jsp 기준, screenshot 컬럼 순서 유지)
 *
 * 디자인은 admin/infra/licenses의 custom-table 패턴(InfraLicensesGrid)과 동일하게
 * 만들어 넓은 컬럼/sticky 헤더/상태 배지/행 색상이 회사 그리드와 같은 시각언어를 유지.
 *
 * 그룹코드(`code`)는 신규 행에서만 편집 가능하다. 저장된 후에는 unique key 역할이므로
 * EditableTextCell를 readOnly로 변환하지 않고, 단순히 표시 모드로 렌더한다 (legacy
 * KeyField:1, UpdateEdit:0, InsertEdit:1 의미를 그대로 반영).
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { Button } from "@/components/ui/button";
import type { CodeGroupRow } from "@jarvis/shared/validation/admin/code";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<CodeGroupRow>>;

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

  const KIND_OPTIONS = KIND_OPTION_VALUES.map((value) => ({
    value,
    label: value === "C" ? t("filter.kindUser") : t("filter.kindSystem"),
  }));

  const BIZ_DIV_OPTIONS = businessDivOptions.map((o) => ({
    value: o.code,
    label: o.label,
  }));

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
              <th className="px-2 py-2 text-left" style={{ width: 160 }}>
                *{t("columns.code")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 220 }}>
                *{t("columns.name")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 280 }}>
                {t("columns.description")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 140 }}>
                {t("columns.businessDiv")}
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 120 }}>
                {t("columns.kind")}
              </th>
              <th className="px-2 py-2 text-right" style={{ width: 100 }}>
                {t("columns.subCnt")}
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
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
                    {/* 그룹코드: edit only when new */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="code"
                      data-cell-value={row.code}
                      onClick={(e) => e.stopPropagation()}
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
                    {/* 코드명 — multiline 가능 (Enter는 input cell이 blur 처리하므로
                        실제 \n 입력은 paste/IME로 가능. EditableTextCell limitation 인정.) */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="name"
                      data-cell-value={row.name}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EditableTextCell
                        value={row.name || null}
                        onCommit={(v) => update(row.id, "name", v ?? "")}
                        required
                      />
                    </td>
                    {/* 코드설명 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="description"
                      data-cell-value={row.description ?? ""}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EditableTextCell
                        value={row.description}
                        onCommit={(v) => update(row.id, "description", v)}
                      />
                    </td>
                    {/* 업무구분 — BIZ_DIVISION 코드 그룹 lookup (Phase-2 완료).
                        legacy getMainMuPrgMainMenuList의 self-join을 정규화된 코드 테이블로 대체. */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="businessDivCode"
                      data-cell-value={row.businessDivCode ?? ""}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EditableSelectCell
                        value={row.businessDivCode}
                        options={BIZ_DIV_OPTIONS}
                        onCommit={(v) => update(row.id, "businessDivCode", v)}
                      />
                    </td>
                    {/* 구분 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="kindCode"
                      data-cell-value={row.kindCode}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EditableSelectCell
                        value={row.kindCode || null}
                        options={KIND_OPTIONS}
                        onCommit={(v) => update(row.id, "kindCode", v ?? "C")}
                        required
                      />
                    </td>
                    {/* 세부 코드수 (read-only) */}
                    <td
                      className="h-8 px-2 align-middle text-right text-[13px] tabular-nums text-slate-700"
                      data-col="subCnt"
                      data-cell-value={String(row.subCnt)}
                    >
                      {row.subCnt.toLocaleString()}
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
