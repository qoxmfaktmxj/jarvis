"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { MaintenanceAssignmentRow } from "@jarvis/shared/validation/maintenance";
import {
  listMaintenanceAction,
  saveMaintenanceAction,
} from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/grid/DataGrid";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import type { ColumnDef, FilterDef } from "@/components/grid/types";

type Row = MaintenanceAssignmentRow;
type Option = { value: string; label: string };

type Props = {
  initial: Row[];
  total: number;
  contractTypeOptions: Option[];
  canWrite: boolean;
  canAdmin: boolean;
};

const PAGE_SIZE = 50;

function makeBlankRow(): Row {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: "",
    userName: null,
    companyId: "",
    companyName: null,
    startDate: now.slice(0, 10),
    endDate: now.slice(0, 10),
    contractNumber: null,
    contractType: null,
    note: null,
    updatedBy: null,
    updatedAt: now,
    createdAt: now,
  };
}

export function ManageGridContainer({
  initial,
  total,
  contractTypeOptions,
  canWrite,
  canAdmin,
}: Props) {
  const t = useTranslations("Maintenance.Assignments");
  const [rows, setRows] = useState<Row[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("maintenance.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "maintenance.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "maintenance.pendingFilters",
    {},
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listMaintenanceAction({
          q: nextFilters.q || undefined,
          contractType: nextFilters.contractType || undefined,
          activeOn: nextFilters.activeOn || undefined,
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
      { key: "userName", label: t("columns.user"), type: "text", width: 130, editable: false },
      { key: "companyName", label: t("columns.company"), type: "text", width: 200, editable: false },
      { key: "startDate", label: t("columns.startDate"), type: "date", width: 130, editable: canWrite, required: true },
      { key: "endDate", label: t("columns.endDate"), type: "date", width: 130, editable: canWrite, required: true },
      { key: "contractNumber", label: t("columns.contractNumber"), type: "text", width: 140, editable: canWrite },
      {
        key: "contractType",
        label: t("columns.contractType"),
        type: "select",
        width: 140,
        editable: canWrite,
        options: contractTypeOptions,
      },
      { key: "note", label: t("columns.note"), type: "textarea", editable: canWrite },
      { key: "updatedBy", label: t("columns.updatedBy"), type: "readonly", width: 110 },
      { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 160 },
    ],
    [canWrite, contractTypeOptions, t],
  );

  const FILTERS: FilterDef<Row>[] = [];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: c.label,
      }));
      const contractTypeMap = new Map(contractTypeOptions.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: "유지보수담당",
        sheetName: "Assignments",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "contractType" && typeof v === "string") return contractTypeMap.get(v) ?? v;
          if ((col.key === "startDate" || col.key === "endDate") && typeof v === "string") return v.slice(0, 10);
          if (col.key === "updatedAt" && typeof v === "string") return v.slice(0, 16).replace("T", " ");
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [COLUMNS, rows, contractTypeOptions]);

  return (
    <div className="space-y-3">
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
        <GridFilterField label={t("filters.contractType")} className="w-[160px]">
          <select
            value={pendingFilters.contractType ?? ""}
            onChange={(e) => setPending("contractType", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {contractTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("filters.activeOn")} className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.activeOn ?? ""}
            onChange={(e) => setPending("activeOn", e.target.value)}
            placeholder="yyyy-mm-dd"
            className="h-8"
          />
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
          const result = await saveMaintenanceAction({
            creates: changes.creates.map((c) => ({
              userId: c.userId,
              companyId: c.companyId,
              startDate: c.startDate,
              endDate: c.endDate,
              contractNumber: c.contractNumber ?? null,
              contractType: c.contractType ?? null,
              note: c.note ?? null,
            })),
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
