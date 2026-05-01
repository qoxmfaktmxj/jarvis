"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenuPermissionGrid.tsx
 *
 * 메뉴 권한(detail) 그리드.
 *
 * 컬럼: No / 상태 / 권한 코드 / 설명 / 할당됨(boolean)
 *
 * NOTE — 디테일 그리드는 행 추가/복사/삭제가 없다 (`PERMISSIONS` 상수가 권한
 * 카탈로그의 SoT). `assigned` boolean만 토글한다. 따라서 toolbar에서
 * Insert/Copy 버튼은 노출하지 않는다.
 *
 * `selectedMenuId === null` 일 때 "메뉴를 선택하세요." 안내를 표시한다
 * (admin/codes/CodeItemGrid의 `emptyMaster` 패턴).
 */
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/components/grid/types";
import type { useGridState } from "@/components/grid/useGridState";
import type { MenuPermissionGridRow } from "./useMenuPermissionGridState";

type GridApi = ReturnType<typeof useGridState<MenuPermissionGridRow>>;

type FilterValues = {
  q: string;
};

type Props = {
  grid: GridApi;
  total: number;
  selectedMenuId: string | null;
  selectedMenuCode: string | null;
  selectedMenuLabel: string | null;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  saving: boolean;
  onSave: () => void;
  onExport: () => void;
};

export function MenuPermissionGrid({
  grid,
  total,
  selectedMenuId,
  selectedMenuCode,
  selectedMenuLabel,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onResetFilters,
  saving,
  onSave,
  onExport,
}: Props) {
  const t = useTranslations("Admin.Menus.detailSection");
  const update = useCallback(
    <K extends keyof MenuPermissionGridRow>(
      id: string,
      key: K,
      value: MenuPermissionGridRow[K],
    ) => grid.update(id, key, value),
    [grid],
  );

  const disabled = !selectedMenuId;

  const COLUMNS: ColumnDef<MenuPermissionGridRow>[] = useMemo(
    () => [
      {
        key: "permissionCode",
        label: t("columns.permissionCode"),
        type: "text",
        width: 220,
        editable: false,
      },
      {
        key: "permissionDescription",
        label: t("columns.permissionDescription"),
        type: "text",
        width: 320,
        editable: false,
      },
      {
        key: "assigned",
        label: t("columns.assigned"),
        type: "boolean",
        width: 90,
        editable: true,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-2">
      {/* Search form */}
      <GridSearchForm
        onSearch={onApplyFilters}
        isSearching={saving || disabled}
        searchLabel={t("filter.search")}
      >
        <GridFilterField label={t("filter.code")} className="w-[210px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            disabled={disabled}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus) disabled:opacity-50"
          />
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center justify-between">
        <span className="text-sm text-(--fg-secondary)">
          {t("title")}
          {selectedMenuId ? (
            <>
              {" — "}
              <span className="font-mono text-(--fg-primary)">{selectedMenuCode}</span>
              {selectedMenuLabel ? (
                <span className="text-(--fg-muted)"> · {selectedMenuLabel}</span>
              ) : null}
              {" — "}
              {total.toLocaleString()}
            </>
          ) : (
            <span className="ml-1 text-(--fg-muted)">({t("emptyMaster")})</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={grid.dirtyCount === 0 || saving || disabled}
            onClick={onSave}
          >
            {saving
              ? "..."
              : grid.dirtyCount > 0
                ? `${t("toolbar.save")} (${grid.dirtyCount})`
                : t("toolbar.save")}
          </Button>
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

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">{t("columns.no")}</th>
              <th className="w-16 px-2 py-2 text-left">{t("columns.status")}</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-2 py-2",
                    col.type === "boolean" ? "text-center" : "text-left",
                  ].join(" ")}
                  style={col.width ? { minWidth: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!selectedMenuId ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-4 py-12 text-center text-sm text-slate-400"
                >
                  {t("emptyMaster")}
                </td>
              </tr>
            ) : grid.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  {t("empty")}
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => {
                const row = r.data;
                return (
                  <tr
                    key={row.id}
                    data-row-status={r.state}
                    className={[
                      "border-b border-slate-100 transition-colors duration-150",
                      "hover:bg-slate-50",
                      r.state === "dirty" ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                      {i + 1}
                    </td>
                    <td className="h-8 w-16 px-2 align-middle">
                      <RowStatusBadge state={r.state} />
                    </td>
                    {COLUMNS.map((col) => {
                      const val = row[col.key];
                      const editable = col.editable !== false;

                      if (!editable) {
                        return (
                          <td
                            key={col.key}
                            className="h-8 px-2 align-middle text-[13px] text-slate-700"
                            data-col={col.key}
                            data-cell-value={String(val ?? "")}
                          >
                            {col.key === "permissionCode" ? (
                              <span className="font-mono">{String(val ?? "")}</span>
                            ) : (
                              String(val ?? "")
                            )}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className="h-8 p-0 align-middle"
                          data-col={col.key}
                          data-cell-value={
                            val === null || val === undefined ? "" : String(val)
                          }
                        >
                          {col.type === "boolean" && (
                            <EditableBooleanCell
                              value={Boolean(val)}
                              onCommit={(v) =>
                                update(
                                  row.id,
                                  col.key,
                                  v as MenuPermissionGridRow[typeof col.key],
                                )
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
 * Excel export용 컬럼 메타.
 */
export function getMenuPermissionExportColumns(t: (k: string) => string) {
  return [
    { key: "permissionCode", header: t("columns.permissionCode") },
    { key: "permissionDescription", header: t("columns.permissionDescription") },
    { key: "assigned", header: t("columns.assigned") },
  ] as const;
}
