"use client";
/**
 * apps/web/app/(app)/admin/companies/_components/CompaniesGridContainer.tsx
 *
 * companies 도메인 DataGrid 래퍼.
 * 기존 CompaniesGrid를 DataGrid<Company> 기반으로 교체.
 * admin/companies/page.tsx에서 import해 사용.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { listCompanies, saveCompanies } from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DataGrid, type DataGridProps } from "@/components/grid/DataGrid";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import type { ColumnDef, FilterDef } from "@/components/grid/types";

type Company = CompanyRow;
type Option = { value: string; label: string };

type Props = {
  initial: Company[];
  total: number;
  objectDivOptions: Option[];
  groupOptions: Option[];
  industryOptions: Option[];
};

const PAGE_SIZE = 50;

function makeBlankRow(): Company {
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

export function CompaniesGridContainer({
  initial,
  total,
  objectDivOptions,
  groupOptions,
  industryOptions,
}: Props) {
  const [rows, setRows] = useState<Company[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCompanies({
          q: nextFilters.q || undefined,
          objectDiv: nextFilters.objectDiv || undefined,
          groupCode: nextFilters.groupCode || undefined,
          industryCode: nextFilters.industryCode || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (res.ok) {
          setRows(res.rows as Company[]);
          setTotalCount(res.total as number);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [],
  );

  const COLUMNS: ColumnDef<Company>[] = useMemo(
    () => [
      { key: "objectDiv", label: "대상구분", type: "select", width: 110, editable: true, required: true, options: objectDivOptions },
      { key: "groupCode", label: "그룹사", type: "select", width: 120, editable: true, options: groupOptions },
      { key: "code", label: "회사코드", type: "text", width: 110, editable: true, required: true },
      { key: "name", label: "회사명", type: "text", editable: true, required: true },
      { key: "representCompany", label: "대표사", type: "boolean", width: 90, editable: true },
      { key: "startDate", label: "설립일", type: "date", width: 130, editable: true },
      { key: "industryCode", label: "업종", type: "select", width: 130, editable: true, options: industryOptions },
      { key: "zip", label: "우편번호", type: "text", width: 90, editable: true },
    ],
    [objectDivOptions, groupOptions, industryOptions],
  );

  // Per-column filter row removed — filters live in <GridSearchForm> at the top.
  const FILTERS: FilterDef<Company>[] = [];

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: c.label,
      }));
      const objectDivMap = new Map(objectDivOptions.map((o) => [o.value, o.label]));
      const groupMap = new Map(groupOptions.map((o) => [o.value, o.label]));
      const industryMap = new Map(industryOptions.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: "회사마스터",
        sheetName: "회사",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "representCompany") return v ? "Y" : "N";
          if (col.key === "objectDiv" && typeof v === "string")
            return objectDivMap.get(v) ?? v;
          if (col.key === "groupCode" && typeof v === "string")
            return groupMap.get(v) ?? v;
          if (col.key === "industryCode" && typeof v === "string")
            return industryMap.get(v) ?? v;
          if (col.key === "startDate" && typeof v === "string") return v.slice(0, 10);
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
            return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [COLUMNS, rows, objectDivOptions, groupOptions, industryOptions]);

  return (
    <div className="space-y-3">
      <GridSearchForm
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label="대상구분" className="w-[140px]">
          <select
            value={pendingFilters.objectDiv ?? ""}
            onChange={(e) => setPending("objectDiv", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {objectDivOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="그룹사" className="w-[140px]">
          <select
            value={pendingFilters.groupCode ?? ""}
            onChange={(e) => setPending("groupCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {groupOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="코드/회사명" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="코드 또는 회사명"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="업종" className="w-[140px]">
          <select
            value={pendingFilters.industryCode ?? ""}
            onChange={(e) => setPending("industryCode", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {industryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<Company>
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
          const result = await saveCompanies({
            creates: changes.creates,
            updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) {
            await reload(page, filterValues);
          }
          return {
            ok: result.ok,
            errors: result.ok ? [] : result.errors?.map((e) => ({ message: e.message })),
          };
        }}
      />
    </div>
  );
}
