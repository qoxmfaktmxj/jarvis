"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenuPermissionGrid.tsx
 *
 * 메뉴 권한(detail) 그리드 — DataGrid 기반.
 *
 * Phase B: 자체 <table> 완전 제거. DataGrid 단독 사용.
 *
 * NOTE — 디테일 그리드는 행 추가/복사/삭제가 없다 (`PERMISSIONS` 상수가 권한
 * 카탈로그의 SoT). `assigned` boolean만 토글한다. 따라서 allowInsert={false},
 * allowCopy={false}.
 *
 * `selectedMenuId === null`일 때 "메뉴를 선택하세요." 안내를 표시한다
 * (admin/codes/CodeItemGrid의 emptyMaster 패턴).
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { GridRow } from "@/components/grid/useGridState";
import type { MenuPermissionGridRow } from "./useMenuPermissionGridState";

type FilterValues = {
  q: string;
};

type Props = {
  rows: MenuPermissionGridRow[];
  total: number;
  selectedMenuId: string | null;
  selectedMenuCode: string | null;
  selectedMenuLabel: string | null;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onGridReady: (api: { discardChanges: () => void }) => void;
  onDirtyChange: (count: number) => void;
  saving: boolean;
  onSave: (changes: GridChanges<MenuPermissionGridRow>) => Promise<GridSaveResult>;
  onExport: () => void;
  initialGridRows?: GridRow<MenuPermissionGridRow>[];
  onGridRowsChange?: (rows: GridRow<MenuPermissionGridRow>[]) => void;
};

/** makeBlankRow placeholder — 실제로는 호출되지 않는다 (allowInsert=false). */
function makeBlankPermRow(): MenuPermissionGridRow {
  return {
    id: crypto.randomUUID(),
    permissionId: "",
    permissionCode: "",
    permissionDescription: null,
    assigned: false,
  };
}

export function MenuPermissionGrid({
  rows,
  total,
  selectedMenuId,
  selectedMenuCode,
  selectedMenuLabel,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onResetFilters,
  onGridReady,
  onDirtyChange,
  saving,
  onSave,
  onExport,
  initialGridRows,
  onGridRowsChange,
}: Props) {
  const t = useTranslations("Admin.Menus.detailSection");

  const discardRef = useRef<{ discardChanges: () => void } | null>(null);
  const handleGridReady = useCallback(
    (api: { discardChanges: () => void }) => {
      discardRef.current = api;
      onGridReady(api);
    },
    [onGridReady],
  );

  const disabled = !selectedMenuId;

  const columns: ColumnDef<MenuPermissionGridRow>[] = useMemo(
    () => [
      {
        key: "permissionCode",
        label: t("columns.permissionCode"),
        type: "readonly",
        width: 220,
        editable: false,
        render: (row) => (
          <span className="font-mono">{row.permissionCode}</span>
        ),
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
        editable: !disabled,
      },
    ],
    [t, disabled],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <GridSearchForm
        onSearch={onApplyFilters}
        onResetGrid={() => discardRef.current?.discardChanges()}
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

      <div className="flex items-center">
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
      </div>

      <div className="min-h-0 flex-1">
        <DataGrid<MenuPermissionGridRow>
          rows={rows}
          total={total}
          columns={columns}
          filters={[]}
          page={1}
          limit={Math.max(total, 1)}
          makeBlankRow={makeBlankPermRow}
          onPageChange={() => {}}
          onFilterChange={() => {}}
          onSave={onSave}
          emptyMessage={disabled ? t("emptyMaster") : t("empty")}
          onGridReady={handleGridReady}
          onDirtyChange={onDirtyChange}
          initialGridRows={initialGridRows}
          onGridRowsChange={onGridRowsChange}
          readOnly={disabled}
          allowInsert={false}
          allowCopy={false}
          onExport={onExport}
          exportLabel={t("toolbar.export")}
        />
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
