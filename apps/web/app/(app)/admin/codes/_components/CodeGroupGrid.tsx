"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeGroupGrid.tsx
 *
 * 공통코드 — 그룹코드(master) 그리드.
 *
 * Phase C: 자체 <table> 완전 제거. DataGrid 단독 사용.
 * - code 컬럼: lockOnExisting (기존 행 readonly)
 * - selectedId / onSelect로 master 행 선택 통지
 * - GridSearchForm + GridFilterField는 DataGrid 외부 유지
 *
 * 컬럼: *그룹코드 / *코드명 / 코드설명 / 업무구분 / 구분 / 세부코드수
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { CodeGroupRow } from "@jarvis/shared/validation/admin/code";
import { makeBlankCodeGroup } from "./useCodeGroupGridState";

const KIND_OPTION_VALUES = ["C", "N"] as const;

/** input / select 공통 className (baseline 표준) */
const INPUT_CLS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

type FilterValues = {
  q: string;
  qName: string;
  includesDetailCodeNm: string;
  kind: string;
};

type BusinessDivOption = { code: string; label: string };

type Props = {
  rows: CodeGroupRow[];
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
  onSave: (changes: GridChanges<CodeGroupRow>) => Promise<GridSaveResult>;
  onExport: () => void;
  businessDivOptions: BusinessDivOption[];
  /** DataGrid 내부 rows 상태 mirror — export / selectedGroup 계산에 사용. */
  onGridRowsChange?: (rows: import("@/components/grid/useGridState").GridRow<CodeGroupRow>[]) => void;
};

export function CodeGroupGrid({
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
  businessDivOptions,
  onGridRowsChange,
}: Props) {
  const t = useTranslations("Admin.Codes.groupSection");

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
        label: value === "C" ? t("filter.kindUser") : t("filter.kindSystem"),
      })),
    [t],
  );

  const BIZ_DIV_OPTIONS = useMemo(
    () => businessDivOptions.map((o) => ({ value: o.code, label: o.label })),
    [businessDivOptions],
  );

  const columns: ColumnDef<CodeGroupRow>[] = useMemo(
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
        key: "name",
        label: `*${t("columns.name")}`,
        type: "text",
        width: 220,
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
        key: "businessDivCode",
        label: t("columns.businessDiv"),
        type: "select",
        width: 140,
        editable: true,
        options: BIZ_DIV_OPTIONS,
      },
      {
        key: "kindCode",
        label: t("columns.kind"),
        type: "select",
        width: 120,
        editable: true,
        required: true,
        options: KIND_OPTIONS,
      },
      {
        key: "subCnt",
        label: t("columns.subCnt"),
        type: "numeric",
        width: 100,
        editable: false,
      },
    ],
    [t, BIZ_DIV_OPTIONS, KIND_OPTIONS],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Search form — DataGrid 외부. discardRef 경유로 DataGrid.discardChanges 연결. */}
      <GridSearchForm
        onSearch={onApplyFilters}
        onResetGrid={() => discardRef.current?.discardChanges()}
        isSearching={saving}
        searchLabel={t("filter.search")}
      >
        <GridFilterField label={t("filter.code")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.name")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.qName}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, qName: e.target.value })}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField
          label={t("filter.includesDetailCodeNmPlaceholder")}
          className="w-[140px]"
        >
          <input
            type="text"
            value={draftFilters.includesDetailCodeNm}
            onChange={(e) =>
              onDraftFilterChange({ ...draftFilters, includesDetailCodeNm: e.target.value })
            }
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.kind")} className="w-[140px]">
          <select
            value={draftFilters.kind}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, kind: e.target.value })}
            className={INPUT_CLS}
          >
            <option value="">{t("filter.kindAll")}</option>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center">
        <span className="text-sm text-slate-600">
          {t("title")} — {total.toLocaleString()}
        </span>
      </div>

      {/* DataGrid: 내장 toolbar(입력/복사/저장/export). */}
      <DataGrid<CodeGroupRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={1}
        limit={Math.max(total, 1)}
        makeBlankRow={makeBlankCodeGroup}
        makeCopyRow={(c) => ({ ...c, id: crypto.randomUUID(), code: "", subCnt: 0 })}
        onPageChange={() => {}}
        onFilterChange={() => {}}
        onSave={onSave}
        onGridReady={handleGridReady}
        onDirtyChange={onDirtyChange}
        selectedId={selectedId}
        onSelect={onSelect}
        onExport={onExport}
        exportLabel={t("toolbar.export")}
        allowInsert={true}
        allowCopy={true}
        onGridRowsChange={onGridRowsChange}
      />
    </div>
  );
}

/**
 * Excel export용 컬럼 메타 추출 헬퍼.
 * CodesPageClient가 exportToExcel({ columns, ... })를 호출할 때 사용한다.
 */
export function getCodeGroupExportColumns(t: (k: string) => string) {
  return [
    { key: "code", header: t("columns.code") },
    { key: "name", header: t("columns.name") },
    { key: "description", header: t("columns.description") },
    { key: "businessDivCode", header: t("columns.businessDiv") },
    { key: "kindCode", header: t("columns.kind") },
    { key: "subCnt", header: t("columns.subCnt") },
  ] as const;
}
