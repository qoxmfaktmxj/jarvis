"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import type { ColumnDef } from "@/components/grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import {
  listPlanViewPermissions,
  savePlanAcl,
  savePlanViewPermissions,
} from "../actions";
import type { SalesPlanViewPerformanceRow } from "@jarvis/shared/validation/sales-contract-extra";

type FilterState = {
  q: string;
  contYear: string;
  companyCd: string;
  page: string;
};

type Props = {
  rows: SalesPlanViewPerformanceRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

const columns: ColumnDef<SalesPlanViewPerformanceRow>[] = [
  { key: "dataType", label: "자료구분", type: "text", width: 100, editable: true, required: true },
  { key: "contYear", label: "귀속년도", type: "text", width: 90, editable: true, required: true },
  { key: "companyCd", label: "회사코드", type: "text", width: 110, editable: true, required: true },
  { key: "companyNm", label: "회사명", type: "text", width: 180, editable: true },
  { key: "costCd", label: "코스트", type: "text", width: 110, editable: true, required: true },
  { key: "pjtCode", label: "프로젝트코드", type: "text", width: 130, editable: true, required: true },
  { key: "pjtNm", label: "프로젝트명", type: "text", width: 220, editable: true },
  { key: "title", label: "계약명", type: "text", width: 220, editable: true },
  { key: "totOrderAmt", label: "총수주", type: "numeric", width: 120, editable: true },
  { key: "servAmt", label: "서비스매출", type: "numeric", width: 120, editable: true },
  { key: "prodAmt", label: "제품매출", type: "numeric", width: 120, editable: true },
  { key: "canRead", label: "내 읽기", type: "boolean", width: 90, editable: false },
  { key: "canWrite", label: "내 쓰기", type: "boolean", width: 90, editable: false },
  { key: "changeReason", label: "변경사유", type: "textarea", width: 240, editable: true },
];

function makeBlankRow(): SalesPlanViewPerformanceRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    dataType: "",
    companyCd: "",
    costCd: "",
    pjtCode: "",
    contYear: "",
    pjtNm: null,
    companyNo: null,
    companyNm: null,
    companyType: null,
    inOutType: null,
    title: null,
    custNm: null,
    contGbCd: null,
    contYmd: null,
    contSymd: null,
    contEymd: null,
    newYn: null,
    contType: null,
    productType: null,
    totOrderAmt: null,
    serOrderAmt: null,
    prdOrderAmt: null,
    infOrderAmt: null,
    servAmt: null,
    prodAmt: null,
    inManMonth: null,
    outManMonth: null,
    sgaAmt: null,
    expAmt: null,
    changeReason: null,
    canRead: true,
    canWrite: false,
    createdAt: now,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function PlanViewPermissionsGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });
  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);
  const [aclForm, setAclForm] = useState({
    planId: "",
    userId: "",
    canRead: true,
    canWrite: false,
  });
  const [aclMessage, setAclMessage] = useState<string | null>(null);
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((current) => ({ ...current, [key]: value }));

  const reload = useCallback(
    (nextPage: number, filters: FilterState) => {
      startTransition(async () => {
        const result = await listPlanViewPermissions({
          q: filters.q || undefined,
          contYear: filters.contYear || undefined,
          companyCd: filters.companyCd || undefined,
          page: nextPage,
          limit,
        });
        if (result.ok) {
          setRows(result.rows);
          setTotal(result.total);
        }
      });
    },
    [limit],
  );

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("contYear", pendingFilters.contYear);
    setUrlFilter("companyCd", pendingFilters.companyCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleAclSave = async () => {
    setAclMessage(null);
    const result = await savePlanAcl(aclForm);
    setAclMessage(result.ok ? "권한이 저장되었습니다." : result.error ?? "권한 저장 실패");
    if (result.ok) reload(currentPage, urlFilters);
  };

  return (
    <div className="space-y-4">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label="검색어" className="w-[240px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(event) => setPending("q", event.target.value)}
            placeholder="회사명 / 프로젝트명 / 계약명"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="귀속년도" className="w-[120px]">
          <Input
            type="text"
            value={pendingFilters.contYear}
            onChange={(event) => setPending("contYear", event.target.value)}
            placeholder="2026"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="회사코드" className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.companyCd}
            onChange={(event) => setPending("companyCd", event.target.value)}
            placeholder="회사코드"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesPlanViewPerformanceRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/plan-view-permissions/" + row.id + "/detail")}
        onPageChange={(page) => {
          setUrlFilter("page", String(page));
          reload(page, { ...urlFilters, page: String(page) });
        }}
        onFilterChange={() => undefined}
        onSave={async (changes) => {
          const result = await savePlanViewPermissions({
            creates: changes.creates,
            updates: changes.updates.map((update) => ({ id: update.id, ...update.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) reload(currentPage, urlFilters);
          return {
            ok: result.ok,
            errors: result.errors?.map((error) => ({ message: error.message })),
          };
        }}
      />

      <section className="space-y-3 border-t border-(--border-default) pt-4">
        <h2 className="text-sm font-semibold text-(--fg-primary)">행 권한</h2>
        <div className="flex flex-wrap items-end gap-3">
          <GridFilterField label="Plan ID" className="w-[300px]">
            <Input
              type="text"
              value={aclForm.planId}
              onChange={(event) => setAclForm((current) => ({ ...current, planId: event.target.value }))}
              placeholder="계획/전망/실적 행 UUID"
              className="h-8"
            />
          </GridFilterField>
          <GridFilterField label="User ID" className="w-[300px]">
            <Input
              type="text"
              value={aclForm.userId}
              onChange={(event) => setAclForm((current) => ({ ...current, userId: event.target.value }))}
              placeholder="사용자 UUID"
              className="h-8"
            />
          </GridFilterField>
          <label className="flex h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aclForm.canRead}
              onChange={(event) => setAclForm((current) => ({ ...current, canRead: event.target.checked }))}
            />
            읽기
          </label>
          <label className="flex h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aclForm.canWrite}
              onChange={(event) => setAclForm((current) => ({ ...current, canWrite: event.target.checked }))}
            />
            쓰기
          </label>
          <Button type="button" size="sm" onClick={handleAclSave}>
            권한 저장
          </Button>
          {aclMessage ? <p className="text-sm text-(--fg-muted)">{aclMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}
