"use client";
/**
 * apps/web/app/(app)/admin/roles/_components/RoleGrid.tsx
 *
 * 역할 마스터(role) 그리드 — DataGrid 기반.
 *
 * - code 컬럼: lockOnExisting (기존 행 readonly, 시스템 역할 코드 보호)
 * - isSystem 컬럼: readonly (시스템 역할은 편집 불가)
 * - GridSearchForm + GridFilterField는 DataGrid 외부 유지
 *
 * 패턴 출처: apps/web/app/(app)/admin/menus/_components/MenuGrid.tsx.
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { GridRow } from "@/components/grid/useGridState";
import type { RoleRow } from "@jarvis/shared/validation/admin/role";

function makeBlankRole(): RoleRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    description: null,
    isSystem: false,
    permCount: 0,
  };
}

type FilterValues = {
  q: string;
};

type Props = {
  rows: RoleRow[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onGridReady: (api: { discardChanges: () => void }) => void;
  onDirtyChange: (count: number) => void;
  saving: boolean;
  onSave: (changes: GridChanges<RoleRow>) => Promise<GridSaveResult>;
  onExport: () => void;
  initialGridRows?: GridRow<RoleRow>[];
  onGridRowsChange?: (rows: GridRow<RoleRow>[]) => void;
};

export function RoleGrid({
  rows,
  total,
  selectedId,
  onSelect,
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
  const t = useTranslations("Admin.Roles");

  const discardRef = useRef<{ discardChanges: () => void } | null>(null);
  const handleGridReady = useCallback(
    (api: { discardChanges: () => void }) => {
      discardRef.current = api;
      onGridReady(api);
    },
    [onGridReady],
  );

  const columns: ColumnDef<RoleRow>[] = useMemo(
    () => [
      {
        key: "code",
        label: `*${t("columns.code")}`,
        type: "text",
        width: 130,
        editable: true,
        required: true,
        lockOnExisting: true,
      },
      {
        key: "name",
        label: `*${t("columns.name")}`,
        type: "text",
        width: 160,
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
        key: "isSystem",
        label: t("columns.isSystem"),
        type: "boolean",
        width: 90,
        editable: false,
      },
      {
        key: "permCount",
        label: t("columns.permCount"),
        type: "numeric",
        width: 90,
        editable: false,
        integer: true,
      },
    ],
    [t],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <GridSearchForm
        onSearch={onApplyFilters}
        onResetGrid={() => discardRef.current?.discardChanges()}
        isSearching={saving}
        searchLabel="조회"
      >
        <GridFilterField label={t("filter.keyword")} className="w-[260px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            placeholder={t("filter.keywordPlaceholder")}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center">
        <span className="text-sm text-(--fg-secondary)">
          {t("masterSection.title")} — {total.toLocaleString()}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <DataGrid<RoleRow>
          rows={rows}
          total={total}
          columns={columns}
          filters={[]}
          page={1}
          limit={Math.max(total, 1)}
          makeBlankRow={makeBlankRole}
          makeCopyRow={(c) => ({ ...c, id: crypto.randomUUID(), code: "", permCount: 0, isSystem: false })}
          onPageChange={() => {}}
          onFilterChange={() => {}}
          onSave={onSave}
          emptyMessage={t("masterSection.empty")}
          onGridReady={handleGridReady}
          onDirtyChange={onDirtyChange}
          initialGridRows={initialGridRows}
          onGridRowsChange={onGridRowsChange}
          selectedId={selectedId}
          onSelect={onSelect}
          onExport={onExport}
          exportLabel={t("actions.export")}
          allowInsert={true}
          allowCopy={true}
        />
      </div>
    </div>
  );
}

export function getRoleExportColumns(t: (k: string) => string) {
  return [
    { key: "code", header: t("columns.code") },
    { key: "name", header: t("columns.name") },
    { key: "description", header: t("columns.description") },
    { key: "isSystem", header: t("columns.isSystem") },
    { key: "permCount", header: t("columns.permCount") },
  ] as const;
}
