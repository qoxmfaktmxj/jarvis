"use client";
/**
 * apps/web/app/(app)/holidays/_components/HolidaysGridContainer.tsx
 *
 * Holidays admin grid. Wraps DataGrid with year filter.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { HolidayRow } from "@jarvis/shared/validation/holidays";
import { DataGrid } from "@/components/grid/DataGrid";
import { type GridRow, overlayGridRows, rowsToBatch } from "@/components/grid/useGridState";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
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
  const [year, setYear] = useTabState<number>("holidays.year", initialYear);
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<HolidayRow>[]>(
    "holidays.gridRows",
    [],
  );
  const [dirtyCount, setDirtyCount] = useState(0);
  const [, startTransition] = useTransition();

  useTabDirty(dirtyCount > 0);

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/holidays";
  const tabKey = pathnameToTabKey(pathname);
  const initialGridRows = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(initial, gridRowsCache.length > 0 ? gridRowsCache : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const ctx = useTabContext();
  const gridRowsCacheRef = useRef(gridRowsCache);
  gridRowsCacheRef.current = gridRowsCache;
  useEffect(() => {
    return ctx.registerSaveHandler(tabKey, async () => {
      const changes = rowsToBatch(gridRowsCacheRef.current);
      if (
        changes.creates.length === 0 &&
        changes.updates.length === 0 &&
        changes.deletes.length === 0
      ) {
        return { ok: true };
      }
      const result = await saveHolidaysAction({
        creates: changes.creates.map((c) => ({ date: c.date, name: c.name, note: c.note ?? null })),
        updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

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
    [setYear],
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 표준 그리드 select 토큰 (admin/companies, sales/* 등과 동일):
          h-8 border-(--border-default) bg-(--bg-page) px-2 text-[13px]. */}
      <div className="flex items-center gap-2">
        <label className="text-[12px] font-medium text-(--fg-primary)">
          {t("filters.year")}
        </label>
        <select
          value={year}
          onChange={(e) => reload(Number(e.currentTarget.value))}
          className="h-8 rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
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
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onDirtyChange={setDirtyCount}
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
