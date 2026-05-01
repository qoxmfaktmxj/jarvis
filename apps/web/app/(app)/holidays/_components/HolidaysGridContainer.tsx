"use client";
/**
 * apps/web/app/(app)/holidays/_components/HolidaysGridContainer.tsx
 *
 * Holidays admin grid. Wraps DataGrid with year filter.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { HolidayRow } from "@jarvis/shared/validation/holidays";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listHolidaysAction, saveHolidaysAction } from "../actions";

type Props = {
  initial: HolidayRow[];
  initialYear: number;
};

const PAGE_SIZE = 100;

function makeBlankRow(): HolidayRow {
  return {
    id: crypto.randomUUID(),
    date: "",
    name: "",
    note: null,
  };
}

export function HolidaysGridContainer({ initial, initialYear }: Props) {
  const t = useTranslations("Holidays");
  const [rows, setRows] = useState<HolidayRow[]>(initial);
  const [year, setYear] = useState(initialYear);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextYear: number) => {
      startTransition(async () => {
        const res = await listHolidaysAction({ year: nextYear });
        if (res.ok && res.rows) {
          setRows(res.rows);
          setYear(nextYear);
        }
      });
    },
    [],
  );

  const COLUMNS: ColumnDef<HolidayRow>[] = useMemo(
    () => [
      { key: "date", label: t("columns.date"), type: "date", width: 140, editable: true, required: true },
      { key: "name", label: t("columns.name"), type: "text", editable: true, required: true },
      { key: "note", label: t("columns.note"), type: "text", editable: true },
    ],
    [t],
  );

  const FILTERS: FilterDef<HolidayRow>[] = [];

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">{t("filters.year")}</label>
        <select
          value={year}
          onChange={(e) => reload(Number(e.currentTarget.value))}
          className="h-8 rounded border border-slate-200 px-2 text-sm"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <DataGrid<HolidayRow>
        rows={rows}
        total={rows.length}
        columns={COLUMNS}
        filters={FILTERS}
        page={1}
        limit={PAGE_SIZE}
        makeBlankRow={makeBlankRow}
        onPageChange={() => {}}
        onFilterChange={() => {}}
        onSave={async (changes) => {
          const result = await saveHolidaysAction({
            creates: changes.creates.map((c) => ({ date: c.date, name: c.name, note: c.note ?? null })),
            updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) reload(year);
          return {
            ok: result.ok,
            errors: result.errors?.map((e) => ({ message: e.message })),
          };
        }}
      />
    </div>
  );
}
