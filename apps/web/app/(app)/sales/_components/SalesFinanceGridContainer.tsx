"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";

type Row = { id: string };

type ListResult<T> = {
  ok: boolean;
  rows: T[];
  total: number;
  page: number;
  limit: number;
  error?: string;
};

type ExportResult =
  | { ok: true; filename: string; bytes: Uint8Array }
  | { ok: false; error: string };

type FilterField = {
  key: string;
  label: string;
  placeholder?: string;
};

type Props<T extends Row, F extends Record<string, string>> = {
  rows: T[];
  total: number;
  limit: number;
  initialFilters: F;
  columns: ColumnDef<T>[];
  filterFields: FilterField[];
  makeBlankRow: () => T;
  listAction: (input: unknown) => Promise<ListResult<T>>;
  saveAction: (input: unknown) => Promise<GridSaveResult>;
  exportAction: (input: unknown) => Promise<ExportResult>;
};

export function SalesFinanceGridContainer<T extends Row, F extends Record<string, string>>({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
  columns,
  filterFields,
  makeBlankRow,
  listAction,
  saveAction,
  exportAction,
}: Props<T, F>) {
  const common = useTranslations("Sales.Common");
  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<F>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);
  const [rows, setRows] = useState<T[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [pendingFilters, setPendingFilters] = useState<F>(initialFilters);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: keyof F & string, value: string) => {
    setPendingFilters((p) => ({ ...p, [key]: value }) as F);
  };

  const reload = useCallback(
    (nextPage: number, nextFilters: F) => {
      startTransition(async () => {
        const input: Record<string, string | number | undefined> = {
          page: nextPage,
          limit,
        };
        for (const [key, value] of Object.entries(nextFilters)) {
          if (key !== "page" && value) input[key] = value;
        }
        const res = await listAction(input);
        if (res.ok) {
          setRows(res.rows);
          setTotal(res.total);
        }
      });
    },
    [limit, listAction],
  );

  const handleSearch = useCallback(() => {
    for (const [key, value] of Object.entries(pendingFilters)) {
      setUrlFilter(key as keyof F & string, (key === "page" ? "1" : value) as F[keyof F & string]);
    }
    reload(1, { ...pendingFilters, page: "1" } as F);
  }, [pendingFilters, reload, setUrlFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(urlFilters)) {
        if (key !== "page" && value) filters[key] = value;
      }
      const res = await exportAction(filters);
      if (res.ok) {
        triggerDownload(res.bytes, res.filename);
      } else {
        alert(res.error);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async (changes: GridChanges<T>) => {
    const res = await saveAction(changes);
    if (res.ok) {
      reload(currentPage, urlFilters);
    }
    return res;
  };

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        {filterFields.map((field) => (
          <GridFilterField key={field.key} label={field.label} className="w-[180px]">
            <Input
              type="text"
              value={pendingFilters[field.key as keyof F] ?? ""}
              onChange={(e) => setPending(field.key as keyof F & string, e.target.value)}
              placeholder={field.placeholder}
              className="h-8"
            />
          </GridFilterField>
        ))}
      </GridSearchForm>

      <DataGrid<T>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onExport={handleExport}
        isExporting={isExporting}
        exportLabel={common("Excel.button")}
        exportingLabel={common("Excel.downloading")}
        onPageChange={(p) => {
          setUrlFilter("page" as keyof F & string, String(p) as F[keyof F & string]);
          reload(p, { ...urlFilters, page: String(p) } as F);
        }}
        onFilterChange={() => {
          // Filters are owned by the search form above.
        }}
        onSave={handleSave}
      />
    </div>
  );
}
