"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { Input } from "@/components/ui/input";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { listSalesCompanies, saveSalesCompanies } from "../actions";

type Option = { value: string; label: string };

type Props = {
  initial: CompanyRow[];
  total: number;
  objectDivOptions: Option[];
  groupOptions: Option[];
  industryOptions: Option[];
};

const PAGE_SIZE = 50;

function makeBlankRow(): CompanyRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    groupCode: null,
    objectDiv: "001",
    manageDiv: null,
    representCompany: false,
    category: null,
    startDate: null,
    industryCode: null,
    zip: null,
    address: null,
    homepage: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function SalesCompaniesGridContainer({
  initial,
  total,
  objectDivOptions,
  groupOptions,
  industryOptions,
}: Props) {
  const [rows, setRows] = useState<CompanyRow[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useTabState<number>("sales-companies.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "sales-companies.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "sales-companies.pendingFilters",
    {},
  );
  const [isExporting, setIsExporting] = useState(false);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [isSearching, startTransition] = useTransition();

  useTabDirty(dirtyCount > 0);

  const columns: ColumnDef<CompanyRow>[] = useMemo(
    () => [
      { key: "objectDiv", label: "대상구분", type: "select", width: 110, editable: true, required: true, options: objectDivOptions },
      { key: "groupCode", label: "그룹사", type: "select", width: 120, editable: true, options: groupOptions },
      { key: "code", label: "회사코드", type: "text", width: 120, editable: true, required: true },
      { key: "name", label: "회사명", type: "text", width: 220, editable: true, required: true },
      { key: "manageDiv", label: "관리구분", type: "text", width: 110, editable: true },
      { key: "representCompany", label: "대표사", type: "boolean", width: 90, editable: true },
      { key: "category", label: "분류", type: "text", width: 110, editable: true },
      { key: "startDate", label: "설립일", type: "date", width: 120, editable: true },
      { key: "industryCode", label: "업종", type: "select", width: 130, editable: true, options: industryOptions },
      { key: "zip", label: "우편번호", type: "text", width: 90, editable: true },
      { key: "address", label: "주소", type: "text", width: 260, editable: true },
      { key: "homepage", label: "홈페이지", type: "text", width: 200, editable: true },
    ],
    [groupOptions, industryOptions, objectDivOptions],
  );

  const filters: FilterDef<CompanyRow>[] = [];
  const setPending = (key: string, value: string) =>
    setPendingFilters((current) => ({ ...current, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const result = await listSalesCompanies({
          q: nextFilters.q || undefined,
          objectDiv: nextFilters.objectDiv || undefined,
          groupCode: nextFilters.groupCode || undefined,
          industryCode: nextFilters.industryCode || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (result.ok) {
          setRows(result.rows as CompanyRow[]);
          setTotalCount(Number(result.total ?? 0));
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [setFilterValues, setPage],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportToExcel({
        filename: "영업_회사관리",
        sheetName: "회사",
        columns: columns.map((column) => ({ key: column.key, header: column.label })),
        rows,
      });
    } finally {
      setIsExporting(false);
    }
  }, [columns, rows]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={() => reload(1, pendingFilters)} isSearching={isSearching}>
        <GridFilterField label="대상구분" className="w-[140px]">
          <select
            value={pendingFilters.objectDiv ?? ""}
            onChange={(event) => setPending("objectDiv", event.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary)"
          >
            <option value="">전체</option>
            {objectDivOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="그룹사" className="w-[140px]">
          <select
            value={pendingFilters.groupCode ?? ""}
            onChange={(event) => setPending("groupCode", event.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary)"
          >
            <option value="">전체</option>
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="코드/회사명" className="w-[220px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(event) => setPending("q", event.target.value)}
            placeholder="코드 또는 회사명"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<CompanyRow>
        rows={rows}
        total={totalCount}
        columns={columns}
        filters={filters}
        page={page}
        limit={PAGE_SIZE}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        onDirtyChange={setDirtyCount}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(nextPage) => reload(nextPage, filterValues)}
        onFilterChange={(nextFilters) => reload(1, nextFilters)}
        onSave={async (changes) => {
          const result = await saveSalesCompanies({
            creates: changes.creates,
            updates: changes.updates.map((update) => ({
              id: update.id,
              ...update.patch,
            })),
            deletes: changes.deletes,
          });
          if (result.ok) await reload(page, filterValues);
          return {
            ok: result.ok,
            errors: result.ok
              ? []
              : result.errors?.map((error) => ({ message: error.message })),
          };
        }}
      />
    </div>
  );
}
