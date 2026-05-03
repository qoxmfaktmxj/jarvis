"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ScheduleEventRow } from "@jarvis/shared/validation/schedule";
import { listSchedulesAction, saveSchedulesAction } from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/DatePicker";
import { DataGrid } from "@/components/grid/DataGrid";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { NewEventInlineForm } from "./NewEventInlineForm";

type Row = ScheduleEventRow;

type Props = {
  initial: Row[];
  total: number;
  canWrite: boolean;
};

const PAGE_SIZE = 50;

function makeBlankRow(): Row {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: "",
    userName: null,
    userEmployeeId: null,
    startDate: now.slice(0, 10),
    endDate: now.slice(0, 10),
    title: "",
    memo: null,
    orderSeq: 0,
    isShared: false,
    updatedBy: null,
    updatedAt: now,
    createdAt: now,
    isOwn: true,
  };
}

export function ScheduleGridContainer({ initial, total, canWrite }: Props) {
  const t = useTranslations("Schedule.Page");
  const [rows, setRows] = useState<Row[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("schedule.list.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "schedule.list.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "schedule.list.pendingFilters",
    {},
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listSchedulesAction({
          q: nextFilters.q || undefined,
          activeOn: nextFilters.activeOn || undefined,
          ownOnly: nextFilters.ownOnly === "false" ? false : true,
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
      { key: "startDate", label: t("columns.startDate"), type: "date", width: 130, editable: canWrite, required: true },
      { key: "endDate", label: t("columns.endDate"), type: "date", width: 130, editable: canWrite, required: true },
      { key: "title", label: t("columns.title"), type: "text", width: 240, editable: canWrite, required: true },
      { key: "memo", label: t("columns.memo"), type: "textarea", editable: canWrite },
      { key: "isShared", label: t("columns.isShared"), type: "boolean", width: 80, editable: canWrite },
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
        filename: "개인일정",
        sheetName: "Schedule",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "isShared") return v ? t("shared.yes") : t("shared.no");
          if ((col.key === "startDate" || col.key === "endDate") && typeof v === "string")
            return v.slice(0, 10);
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
  }, [COLUMNS, rows, t]);

  return (
    <div className="space-y-3">
      {canWrite ? (
        <NewEventInlineForm onCreated={() => reload(1, filterValues)} />
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
        <GridFilterField label={t("filters.activeOn")} className="w-[160px]">
          <DatePicker
            value={pendingFilters.activeOn ?? null}
            onChange={(v) => setPending("activeOn", v ?? "")}
            ariaLabel={t("filters.activeOn")}
          />
        </GridFilterField>
        <GridFilterField label={t("filters.ownOnly")} className="w-[140px]">
          <select
            value={pendingFilters.ownOnly ?? "true"}
            onChange={(e) => setPending("ownOnly", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="true">{t("filters.ownOnly")}</option>
            <option value="false">{t("filters.all")}</option>
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
          // 본인 소유가 아닌 행을 update/delete 시도 시 server action에서 cascade 거부.
          // 여기서는 클라이언트 hint만 — 진짜 가드는 server.
          const ownableUpdates = changes.updates.filter((u) => {
            const original = rows.find((r) => r.id === u.id);
            return original?.isOwn ?? false;
          });
          const ownableDeletes = changes.deletes.filter((id) => {
            const original = rows.find((r) => r.id === id);
            return original?.isOwn ?? false;
          });

          if (
            ownableUpdates.length !== changes.updates.length ||
            ownableDeletes.length !== changes.deletes.length
          ) {
            return { ok: false, errors: [{ message: t("errors.notOwner") }] };
          }

          const result = await saveSchedulesAction({
            creates: changes.creates.map((c) => ({
              startDate: c.startDate,
              endDate: c.endDate,
              title: c.title,
              memo: c.memo ?? null,
              orderSeq: c.orderSeq ?? 0,
              isShared: c.isShared ?? false,
            })),
            updates: ownableUpdates.map((u) => ({ id: u.id, ...u.patch })),
            deletes: ownableDeletes,
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
