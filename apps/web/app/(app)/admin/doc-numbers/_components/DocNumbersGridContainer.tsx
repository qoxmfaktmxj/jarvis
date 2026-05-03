"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { DocumentNumberRow } from "@jarvis/shared/validation/document-number";
import { listDocumentNumbersAction, saveDocumentNumbersAction } from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/grid/DataGrid";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { NewDocNumberInlineForm } from "./NewDocNumberInlineForm";

type Row = DocumentNumberRow;

type Props = {
  initial: Row[];
  total: number;
  availableYears: string[];
  canWrite: boolean;
  canAdmin: boolean;
};

const PAGE_SIZE = 50;

function makeBlankRow(): Row {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    year: String(new Date().getFullYear()),
    seq: 0,
    docNo: "",
    docName: "",
    userId: null,
    userName: null,
    userEmployeeId: null,
    docDate: null,
    note: null,
    updatedBy: null,
    updatedAt: now,
    createdAt: now,
  };
}

export function DocNumbersGridContainer({
  initial,
  total,
  availableYears,
  canWrite,
  canAdmin,
}: Props) {
  const t = useTranslations("DocNumbers.Page");
  const [rows, setRows] = useState<Row[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("docNumbers.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "docNumbers.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "docNumbers.pendingFilters",
    {},
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listDocumentNumbersAction({
          q: nextFilters.q || undefined,
          year: nextFilters.year || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (res.ok) {
          setRows(res.rows);
          setTotalCount(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [setPage, setFilterValues],
  );

  const COLUMNS: ColumnDef<Row>[] = useMemo(
    () => [
      { key: "year", label: t("columns.year"), type: "text", width: 80, editable: false },
      { key: "seq", label: t("columns.seq"), type: "readonly", width: 70 },
      { key: "docNo", label: t("columns.docNo"), type: "text", width: 130, editable: false },
      { key: "docName", label: t("columns.docName"), type: "text", editable: canWrite, required: true },
      { key: "userName", label: t("columns.user"), type: "text", width: 120, editable: false },
      { key: "docDate", label: t("columns.docDate"), type: "date", width: 130, editable: canWrite },
      { key: "note", label: t("columns.note"), type: "textarea", editable: canWrite },
      { key: "updatedBy", label: t("columns.updatedBy"), type: "readonly", width: 110 },
      { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 160 },
    ],
    [canWrite, t],
  );

  const FILTERS: FilterDef<Row>[] = [];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: c.label,
      }));
      await exportToExcel({
        filename: t("excelFilename"),
        sheetName: "DocNumbers",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "docDate" && typeof v === "string") return v.slice(0, 10);
          if (col.key === "updatedAt" && typeof v === "string")
            return v.slice(0, 16).replace("T", " ");
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [COLUMNS, rows]);

  return (
    <div className="space-y-3">
      {canWrite ? (
        <NewDocNumberInlineForm onCreated={() => reload(1, filterValues)} />
      ) : null}

      <GridSearchForm
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label={t("filters.search")} className="w-[220px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("filters.search")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.year")} className="w-[120px]">
          <select
            value={pendingFilters.year ?? ""}
            onChange={(e) => setPending("year", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{t("filters.all")}</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<Row>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={PAGE_SIZE}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => {
          if (!canWrite) {
            return { ok: false, errors: [{ message: t("errors.noPermission") }] };
          }
          if (!canAdmin && changes.deletes.length > 0) {
            return { ok: false, errors: [{ message: t("errors.noPermission") }] };
          }
          // 신규 행은 인라인에서 미지원 (year/seq 자동 할당이라 inline form 사용)
          if (changes.creates.length > 0) {
            return {
              ok: false,
              errors: [{ message: t("actions.newEntry") }],
            };
          }
          const result = await saveDocumentNumbersAction({
            updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) {
            await reload(page, filterValues);
          }
          return {
            ok: result.ok,
            errors: result.ok ? [] : [{ message: result.error ?? "save failed" }],
          };
        }}
      />
    </div>
  );
}
