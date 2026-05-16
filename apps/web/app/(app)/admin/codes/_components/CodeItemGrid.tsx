"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodeItemGrid.tsx
 *
 * 공통코드 — 세부코드(detail) 그리드.
 *
 * Phase C: 자체 <table> 완전 제거. DataGrid 단독 사용.
 * - code 컬럼: lockOnExisting (기존 행 readonly)
 * - selectedGroupId === null: readOnly 모드 + emptyMaster 안내
 * - GridSearchForm + GridFilterField는 DataGrid 외부 유지
 *
 * 컬럼: *세부코드 / 세부코드명 / 순서 / 사용유무 /
 *       영문명 / 비고1~9 / 비고(숫자형) / *시작일 / *종료일
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { CodeItemRow } from "@jarvis/shared/validation/admin/code";
import { makeBlankCodeItem } from "./useCodeItemGridState";

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

/** input / select 공통 className (baseline 표준) */
const INPUT_CLS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

type FilterValues = {
  q: string;
  qName: string;
  useYn: string;
};

type Props = {
  rows: CodeItemRow[];
  total: number;
  selectedGroupId: string | null;
  selectedGroupCode: string | null;
  selectedGroupName: string | null;
  draftFilters: FilterValues;
  onDraftFilterChange: (next: FilterValues) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onGridReady: (api: { discardChanges: () => void }) => void;
  onDirtyChange: (count: number) => void;
  saving: boolean;
  onSave: (changes: GridChanges<CodeItemRow>) => Promise<GridSaveResult>;
  onExport: () => void;
};

export function CodeItemGrid({
  rows,
  total,
  selectedGroupId,
  selectedGroupCode,
  selectedGroupName,
  draftFilters,
  onDraftFilterChange,
  onApplyFilters,
  onResetFilters,
  onGridReady,
  onDirtyChange,
  saving,
  onSave,
  onExport,
}: Props) {
  const t = useTranslations("Admin.Codes.itemSection");

  const discardRef = useRef<{ discardChanges: () => void } | null>(null);
  const handleGridReady = useCallback(
    (api: { discardChanges: () => void }) => {
      discardRef.current = api;
      onGridReady(api);
    },
    [onGridReady],
  );

  const disabled = !selectedGroupId;

  // makeBlankRow는 selectedGroupId가 있을 때만 실제로 호출됨 (disabled=true → allowInsert=false).
  // disabled일 때 placeholder 함수로 대체해 타입 안전성 유지.
  const makeBlankRow = useCallback(
    () => makeBlankCodeItem(selectedGroupId ?? ""),
    [selectedGroupId],
  );

  const columns: ColumnDef<CodeItemRow>[] = useMemo(() => {
    const noteCols: ColumnDef<CodeItemRow>[] = NOTE_KEYS.map((k, idx) => ({
      key: k,
      label: t("columns.note", { n: idx + 1 }),
      type: "textarea" as const,
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
    <div className="flex flex-col gap-2">
      {/* Search form — DataGrid 외부. */}
      <GridSearchForm
        onSearch={onApplyFilters}
        onResetGrid={() => discardRef.current?.discardChanges()}
        isSearching={saving || disabled}
        searchLabel={t("filter.search")}
      >
        <GridFilterField label={t("filter.code")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.q}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, q: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.name")} className="w-[140px]">
          <input
            type="text"
            value={draftFilters.qName}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, qName: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          />
        </GridFilterField>
        <GridFilterField label={t("filter.useYn")} className="w-[140px]">
          <select
            value={draftFilters.useYn}
            onChange={(e) => onDraftFilterChange({ ...draftFilters, useYn: e.target.value })}
            disabled={disabled}
            className={INPUT_CLS}
          >
            <option value="">{t("filter.useYnAll")}</option>
            <option value="Y">{t("filter.useY")}</option>
            <option value="N">{t("filter.useN")}</option>
          </select>
        </GridFilterField>
      </GridSearchForm>

      {/* Detail title with group info */}
      <div className="flex items-center">
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
            <span className="ml-1 text-slate-400">({t("emptyMaster")})</span>
          )}
        </span>
      </div>

      {/* DataGrid */}
      <DataGrid<CodeItemRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={1}
        limit={Math.max(total, 1)}
        makeBlankRow={makeBlankRow}
        makeCopyRow={(c) => ({ ...c, id: crypto.randomUUID(), code: "" })}
        onPageChange={() => {}}
        onFilterChange={() => {}}
        onSave={onSave}
        emptyMessage={disabled ? t("emptyMaster") : undefined}
        onGridReady={handleGridReady}
        onDirtyChange={onDirtyChange}
        readOnly={disabled}
        allowInsert={!disabled}
        allowCopy={!disabled}
        onExport={disabled ? undefined : onExport}
        exportLabel={t("toolbar.export")}
      />
    </div>
  );
}

/**
 * Excel export용 컬럼 메타 추출 헬퍼.
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
