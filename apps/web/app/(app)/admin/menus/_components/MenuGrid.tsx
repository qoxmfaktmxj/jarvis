"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenuGrid.tsx
 *
 * 메뉴 마스터(menu_item) 그리드 — DataGrid 기반.
 *
 * Phase B: 자체 <table> 완전 제거. DataGrid 단독 사용.
 * - code 컬럼: lockOnExisting (기존 행 readonly)
 * - icon 컬럼: col.editor로 IconPickerCell 주입
 * - GridSearchForm + GridFilterField는 DataGrid 외부 유지
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { GridRow } from "@/components/grid/useGridState";
import type { MenuRow } from "@jarvis/shared/validation/admin/menu";
import { IconPickerCell } from "./IconPickerCell";
import { makeBlankMenu } from "./useMenuGridState";

const KIND_OPTION_VALUES = ["menu", "action"] as const;

type FilterValues = {
  q: string;
  kind: string;
  parentCode: string;
  visibility: string;
};

type ParentOption = { code: string; label: string };
type IconOption = { value: string; label: string };

type Props = {
  rows: MenuRow[];
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
  onSave: (changes: GridChanges<MenuRow>) => Promise<GridSaveResult>;
  onExport: () => void;
  parentOptions: ParentOption[];
  iconOptions: IconOption[];
  initialGridRows?: GridRow<MenuRow>[];
  onGridRowsChange?: (rows: GridRow<MenuRow>[]) => void;
};

export function MenuGrid({
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
  parentOptions,
  iconOptions,
  initialGridRows,
  onGridRowsChange,
}: Props) {
  const t = useTranslations("Admin.Menus.masterSection");

  // DataGrid.onGridReady로 받은 discardChanges를 GridSearchForm.onResetGrid에 연결
  const discardRef = useRef<{ discardChanges: () => void } | null>(null);
  const handleGridReady = useCallback(
    (api: { discardChanges: () => void }) => {
      discardRef.current = api;
      onGridReady(api);
    },
    [onGridReady],
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
    () => parentOptions.map((o) => ({ value: o.code, label: o.label })),
    [parentOptions],
  );

  const columns: ColumnDef<MenuRow>[] = useMemo(
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
        // type: "text"로 선언하고 editor로 IconPickerCell 주입.
        // DataGrid는 col.editor가 있으면 type 기반 EditableXxxCell 대신 이를 렌더.
        type: "text",
        width: 170,
        editable: true,
        editor: ({ value, commit, disabled }) =>
          disabled ? (
            <div className="px-2 py-1 text-[13px] text-slate-900">
              {String(value ?? "")}
            </div>
          ) : (
            <IconPickerCell
              value={(value as string | null) || null}
              options={iconOptions}
              onCommit={commit}
            />
          ),
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
        integer: true,
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
        editable: false,
        integer: true,
      },
    ],
    [t, KIND_OPTIONS, PARENT_OPTIONS, iconOptions],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      {/* Search form — DataGrid 외부. DataGrid.onGridReady로 받은 discardChanges 연결. */}
      <GridSearchForm
        onSearch={onApplyFilters}
        onResetGrid={() => discardRef.current?.discardChanges()}
        isSearching={saving}
        searchLabel={t("filter.search")}
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
            onChange={(e) =>
              onDraftFilterChange({ ...draftFilters, parentCode: e.target.value })
            }
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
        <GridFilterField label={t("filter.visibility")} className="w-[120px]">
          <select
            value={draftFilters.visibility}
            onChange={(e) =>
              onDraftFilterChange({ ...draftFilters, visibility: e.target.value })
            }
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{t("filter.visibilityAll")}</option>
            <option value="visible">{t("filter.visibleY")}</option>
            <option value="hidden">{t("filter.visibleN")}</option>
          </select>
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center">
        <span className="text-sm text-(--fg-secondary)">
          {t("title")} — {total.toLocaleString()}
        </span>
      </div>

      {/* DataGrid: 내장 페이지네이션 없음(limit=total), 내장 toolbar(입력/복사/저장/export). */}
      <div className="min-h-0 flex-1">
        <DataGrid<MenuRow>
          rows={rows}
          total={total}
          columns={columns}
          filters={[]}
          page={1}
          limit={Math.max(total, 1)}
          makeBlankRow={makeBlankMenu}
          makeCopyRow={(c) => ({ ...c, id: crypto.randomUUID(), code: "", permCnt: 0 })}
          onPageChange={() => {}}
          onFilterChange={() => {}}
          onSave={onSave}
          emptyMessage={t("empty")}
          onGridReady={handleGridReady}
          onDirtyChange={onDirtyChange}
          initialGridRows={initialGridRows}
          onGridRowsChange={onGridRowsChange}
          selectedId={selectedId}
          onSelect={onSelect}
          onExport={onExport}
          exportLabel={t("toolbar.export")}
          allowInsert={true}
          allowCopy={true}
        />
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
