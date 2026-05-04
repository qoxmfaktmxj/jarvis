"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FaqEntryRow } from "@jarvis/shared/validation/faq";
import { listFaqAction, saveFaqAction } from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/grid/DataGrid";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { NewFaqInlineForm } from "./NewFaqInlineForm";

type Row = FaqEntryRow;
type Option = { value: string; label: string };

type Props = {
  initial: Row[];
  total: number;
  bizCodeOptions: Option[];
  canWrite: boolean;
  canAdmin: boolean;
};

const PAGE_SIZE = 50;

function makeBlankRow(): Row {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    seq: 0,
    bizCode: null,
    question: "",
    answer: "",
    fileSeq: null,
    updatedBy: null,
    updatedAt: now,
    createdAt: now,
  };
}

export function FaqGridContainer({
  initial,
  total,
  bizCodeOptions,
  canWrite,
  canAdmin,
}: Props) {
  const t = useTranslations("Faq.Page");
  const [rows, setRows] = useState<Row[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("faq.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "faq.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "faq.pendingFilters",
    {},
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listFaqAction({
          q: nextFilters.q || undefined,
          bizCode: nextFilters.bizCode || undefined,
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
      { key: "seq", label: t("columns.seq"), type: "readonly", width: 70 },
      {
        key: "bizCode",
        label: t("columns.bizCode"),
        type: "select",
        width: 140,
        editable: canWrite,
        options: bizCodeOptions,
      },
      { key: "question", label: t("columns.question"), type: "text", editable: canWrite, required: true },
      { key: "answer", label: t("columns.answer"), type: "textarea", editable: canWrite, required: true },
      { key: "updatedBy", label: t("columns.updatedBy"), type: "readonly", width: 110 },
      { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 160 },
    ],
    [canWrite, bizCodeOptions, t],
  );

  const FILTERS: FilterDef<Row>[] = [];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: c.label,
      }));
      const bizMap = new Map(bizCodeOptions.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: t("excelFilename"),
        sheetName: "FAQ",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "bizCode" && typeof v === "string") return bizMap.get(v) ?? v;
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
  }, [COLUMNS, rows, bizCodeOptions, t]);

  return (
    <div className="space-y-3">
      {canWrite ? (
        <NewFaqInlineForm
          bizCodeOptions={bizCodeOptions}
          onCreated={() => reload(1, filterValues)}
        />
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
        <GridFilterField label={t("filters.bizCode")} className="w-[180px]">
          <select
            value={pendingFilters.bizCode ?? ""}
            onChange={(e) => setPending("bizCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">{t("filters.all")}</option>
            {bizCodeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
          // 신규 행은 inline form 으로만 (auto SEQ)
          if (changes.creates.length > 0) {
            return {
              ok: false,
              errors: [{ message: t("actions.newEntry") }],
            };
          }
          const result = await saveFaqAction({
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
