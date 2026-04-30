"use client";
/**
 * apps/web/app/(app)/admin/companies/_components/CompaniesGridContainer.tsx
 *
 * companies 도메인 DataGrid 래퍼.
 * 기존 CompaniesGrid를 DataGrid<Company> 기반으로 교체.
 * admin/companies/page.tsx에서 import해 사용.
 */
import { useCallback, useState, useTransition } from "react";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { listCompanies, saveCompanies } from "../actions";
import { DataGrid, type DataGridProps } from "@/components/grid/DataGrid";
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
  const [, startTransition] = useTransition();

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

  const COLUMNS: ColumnDef<Company>[] = [
    { key: "objectDiv", label: "대상구분", type: "select", width: 110, editable: true, required: true, options: objectDivOptions },
    { key: "groupCode", label: "그룹사", type: "select", width: 120, editable: true, options: groupOptions },
    { key: "code", label: "회사코드", type: "text", width: 110, editable: true, required: true },
    { key: "name", label: "회사명", type: "text", editable: true, required: true },
    { key: "representCompany", label: "대표사", type: "boolean", width: 90, editable: true },
    { key: "startDate", label: "설립일", type: "date", width: 130, editable: true },
    { key: "industryCode", label: "업종", type: "select", width: 130, editable: true, options: industryOptions },
    { key: "zip", label: "우편번호", type: "text", width: 90, editable: true },
  ];

  const FILTERS: FilterDef<Company>[] = [
    { key: "objectDiv" as keyof Company & string, type: "select", options: objectDivOptions },
    { key: "groupCode" as keyof Company & string, type: "select", options: groupOptions },
    { key: "q" as keyof Company & string, type: "text", placeholder: "코드/회사명" },
    // representCompany filter — skip (boolean filter less common)
    // startDate filter — skip
    { key: "industryCode" as keyof Company & string, type: "select", options: industryOptions },
    // zip — skip
  ];

  return (
    <DataGrid<Company>
      rows={rows}
      total={totalCount}
      columns={COLUMNS}
      filters={FILTERS}
      page={page}
      limit={PAGE_SIZE}
      makeBlankRow={makeBlankRow}
      filterValues={filterValues}
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
  );
}
