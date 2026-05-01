"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenuGrid.tsx
 *
 * 메뉴 마스터(menu_item) 그리드.
 *
 * 컬럼: No / 삭제 / 상태 / *코드 / 종류 / 부모 / *라벨 / 아이콘 / 경로 /
 *       순서(numeric) / 표시 / 설명(textarea) / 권한수
 *
 * 하이브리드 채택 — `<DataGrid>` 풀 도입 X. 사유는 admin/codes/CodeGroupGrid 헤더 참고.
 *  추가로 본 그리드 고유 사정:
 *    - master/detail 두 grid 상태를 부모(`MenusPageClient`)가 보유 → grid 외부 소유.
 *    - `code` 컬럼은 신규 행에서만 편집 가능 (`lockOnExisting`).
 *    - 부모 select 옵션은 RSC에서 주입 (모든 메뉴 코드).
 */
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableTextAreaCell } from "@/components/grid/cells/EditableTextAreaCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/components/grid/types";
import type { MenuRow } from "@jarvis/shared/validation/admin/menu";
import type { useGridState } from "@/components/grid/useGridState";

type GridApi = ReturnType<typeof useGridState<MenuRow>>;

type MenuColumnDef = ColumnDef<MenuRow> & {
  /** 기존 행에서 readOnly로 표시 (= legacy KeyField). */
  lockOnExisting?: boolean;
};

const KIND_OPTION_VALUES = ["menu", "action"] as const;

type FilterValues = {
  q: string;
  qLabel: string;
  kind: string;
  parentCode: string;
};

type ParentOption = { code: string; label: string };
type IconOption = { value: string; label: string };

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
  parentOptions: ParentOption[];
  iconOptions: IconOption[];
};

export function MenuGrid({
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
  parentOptions,
  iconOptions,
}: Props) {
  const t = useTranslations("Admin.Menus.masterSection");
  const update = useCallback(
    <K extends keyof MenuRow>(id: string, key: K, value: MenuRow[K]) =>
      grid.update(id, key, value),
    [grid],
  );

  const KIND_OPTIONS = useMemo(
    () =>
      KIND_OPTION_VALUES.map((value) => ({
        value,
        label: value === "menu" ? t("kind.menu") : t("kind.action"),
      })),
    [t],
  );

  const PARENT_OPTIONS = useMemo(
    () =>
      // Empty value = top-level (parentId NULL).
      parentOptions.map((o) => ({ value: o.code, label: o.label })),
    [parentOptions],
  );

  const COLUMNS: MenuColumnDef[] = useMemo(
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
        key: "kind",
        label: t("columns.kind"),
        type: "select",
        width: 110,
        editable: true,
        required: true,
        options: KIND_OPTIONS,
      },
      {
        key: "parentCode",
        label: t("columns.parent"),
        type: "select",
        width: 160,
        editable: true,
        options: PARENT_OPTIONS,
      },
      {
        key: "label",
        label: `*${t("columns.label")}`,
        type: "text",
        width: 200,
        editable: true,
        required: true,
      },
      {
        key: "icon",
        label: t("columns.icon"),
        type: "select",
        width: 150,
        editable: true,
        options: iconOptions,
      },
      {
        key: "routePath",
        label: t("columns.routePath"),
        type: "text",
        width: 220,
        editable: true,
      },
      {
        key: "sortOrder",
        label: t("columns.sortOrder"),
        type: "numeric",
        width: 90,
        editable: true,
      },
      {
        key: "isVisible",
        label: t("columns.isVisible"),
        type: "boolean",
        width: 80,
        editable: true,
      },
      {
        key: "badge",
        label: t("columns.badge"),
        type: "text",
        width: 100,
        editable: true,
      },
      {
        key: "keywords",
        label: t("columns.keywords"),
        type: "text",
        width: 240,
        editable: true,
      },
      {
        key: "description",
        label: t("columns.description"),
        type: "textarea",
        width: 240,
        editable: true,
      },
      {
        key: "permCnt",
        label: t("columns.permCnt"),
        type: "numeric",
        width: 90,
        editable: false, // readonly count
      },
    ],
    [t, KIND_OPTIONS, PARENT_OPTIONS, iconOptions],
  );

  return (
    <div className="space-y-2">
      {/* Search form */}
      <GridSearchForm
        onSearch={onApplyFilters}
        isSearching={saving}
        searchLabel={t("filter.search")}
      >
        <GridFilterField label={t("filter.code")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
        <GridFilterField label={t("filter.label")} className="w-[210px]">
          <input
            type="text"
            value={draftFilters.qLabel}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, qLabel: e.target.value })}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
        <GridFilterField label={t("filter.kind")} className="w-[140px]">
          <select
            value={draftFilters.kind}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, kind: e.target.value })}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{t("filter.kindAll")}</option>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("filter.parent")} className="w-[140px]">
          <select
            value={draftFilters.parentCode}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, parentCode: e.target.value })}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{t("filter.parentAll")}</option>
            <option value="__root__">{t("filter.parentRoot")}</option>
            {parentOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center justify-between">
        <span className="text-sm text-(--fg-secondary)">
          {t("title")} — {total.toLocaleString()}
        </span>
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={onInsert}
          onCopy={onCopy}
          onSave={onSave}
          onExport={onExport}
          exportLabel={t("toolbar.export")}
        />
      </div>

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
            {grid.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  {t("empty")}
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

                      // Read-only display
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
                        // lockOnExisting text (e.g. 코드 on existing rows)
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
                          data-cell-value={
                            val === null || val === undefined ? "" : String(val)
                          }
                          onClick={stop}
                        >
                          {col.type === "text" && (
                            <EditableTextCell
                              value={(val as string | null) || null}
                              onCommit={(v) =>
                                update(
                                  row.id,
                                  col.key,
                                  (col.required ? (v ?? "") : v) as MenuRow[typeof col.key],
                                )
                              }
                              required={col.required}
                            />
                          )}
                          {col.type === "textarea" && (
                            <EditableTextAreaCell
                              value={val as string | null}
                              onCommit={(v) =>
                                update(row.id, col.key, v as MenuRow[typeof col.key])
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
                                  (col.required && col.key === "kind"
                                    ? (v ?? "menu")
                                    : v) as MenuRow[typeof col.key],
                                )
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
                                // sortOrder is non-null in MenuRow → fall back to 0
                                const next =
                                  col.key === "sortOrder" ? (v ?? 0) : v;
                                update(
                                  row.id,
                                  col.key,
                                  next as MenuRow[typeof col.key],
                                );
                              }}
                            />
                          )}
                          {col.type === "boolean" && (
                            <EditableBooleanCell
                              value={Boolean(val)}
                              onCommit={(v) =>
                                update(row.id, col.key, v as MenuRow[typeof col.key])
                              }
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
 * Excel export용 컬럼 메타. `*` 마커는 export 시 제거.
 */
export function getMenuExportColumns(t: (k: string) => string) {
  return [
    { key: "code", header: t("columns.code") },
    { key: "kind", header: t("columns.kind") },
    { key: "parentCode", header: t("columns.parent") },
    { key: "label", header: t("columns.label") },
    { key: "icon", header: t("columns.icon") },
    { key: "routePath", header: t("columns.routePath") },
    { key: "sortOrder", header: t("columns.sortOrder") },
    { key: "isVisible", header: t("columns.isVisible") },
    { key: "badge", header: t("columns.badge") },
    { key: "keywords", header: t("columns.keywords") },
    { key: "description", header: t("columns.description") },
    { key: "permCnt", header: t("columns.permCnt") },
  ] as const;
}
