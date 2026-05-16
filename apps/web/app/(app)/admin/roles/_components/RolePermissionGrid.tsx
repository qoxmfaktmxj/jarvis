"use client";
/**
 * apps/web/app/(app)/admin/roles/_components/RolePermissionGrid.tsx
 *
 * 역할 권한(detail) 그리드 — DataGrid 기반.
 *
 * NOTE — 디테일 그리드는 행 추가/복사/삭제가 없다 (permission 카탈로그 SoT).
 * `assigned` boolean만 토글한다. allowInsert={false}, allowCopy={false}.
 *
 * `selectedRoleId === null`일 때 "역할을 선택하세요." 안내를 표시한다.
 *
 * 패턴 출처: apps/web/app/(app)/admin/menus/_components/MenuPermissionGrid.tsx.
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { RolePermissionGridRow } from "./useRolePermissionGridState";

type FilterValues = {
  q: string;
};

type Props = {
  rows: RolePermissionGridRow[];
  total: number;
  selectedRoleId: string | null;
  selectedRoleCode: string | null;
  selectedRoleName: string | null;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onGridReady: (api: { discardChanges: () => void }) => void;
  onDirtyChange: (count: number) => void;
  saving: boolean;
  onSave: (changes: GridChanges<RolePermissionGridRow>) => Promise<GridSaveResult>;
  onExport: () => void;
};

function makeBlankPermRow(): RolePermissionGridRow {
  return {
    id: crypto.randomUUID(),
    permissionId: "",
    permissionCode: "",
    permissionDescription: null,
    assigned: false,
  };
}

export function RolePermissionGrid({
  rows,
  total,
  selectedRoleId,
  selectedRoleCode,
  selectedRoleName,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onGridReady,
  onDirtyChange,
  saving,
  onSave,
  onExport,
}: Props) {
  const t = useTranslations("Admin.Roles");

  const discardRef = useRef<{ discardChanges: () => void } | null>(null);
  const handleGridReady = useCallback(
    (api: { discardChanges: () => void }) => {
      discardRef.current = api;
      onGridReady(api);
    },
    [onGridReady],
  );

  const disabled = !selectedRoleId;

  const columns: ColumnDef<RolePermissionGridRow>[] = useMemo(
    () => [
      {
        key: "permissionCode",
        label: t("detailSection.columns.permissionCode"),
        type: "readonly",
        width: 220,
        editable: false,
        render: (row) => (
          <span className="font-mono">{row.permissionCode}</span>
        ),
      },
      {
        key: "permissionDescription",
        label: t("detailSection.columns.permissionDescription"),
        type: "text",
        width: 280,
        editable: false,
      },
      {
        key: "assigned",
        label: t("detailSection.columns.assigned"),
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
        searchLabel="조회"
      >
        <GridFilterField label={t("detailSection.filter.code")} className="w-[210px]">
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
          {t("detailSection.title")}
          {selectedRoleId ? (
            <>
              {" — "}
              <span className="font-mono text-(--fg-primary)">{selectedRoleCode}</span>
              {selectedRoleName ? (
                <span className="text-(--fg-muted)"> · {selectedRoleName}</span>
              ) : null}
              {" — "}
              {total.toLocaleString()}
            </>
          ) : (
            <span className="ml-1 text-(--fg-muted)">({t("detailSection.empty")})</span>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <DataGrid<RolePermissionGridRow>
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
          emptyMessage={disabled ? t("detailSection.empty") : t("detailSection.noPermissions")}
          onGridReady={handleGridReady}
          onDirtyChange={onDirtyChange}
          readOnly={disabled}
          allowInsert={false}
          allowCopy={false}
          onExport={onExport}
          exportLabel={t("actions.export")}
        />
      </div>
    </div>
  );
}

export function getRolePermissionExportColumns(t: (k: string) => string) {
  return [
    { key: "permissionCode", header: t("detailSection.columns.permissionCode") },
    { key: "permissionDescription", header: t("detailSection.columns.permissionDescription") },
    { key: "assigned", header: t("detailSection.columns.assigned") },
  ] as const;
}
