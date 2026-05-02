"use client";

import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import type { ColumnDef } from "@/components/grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import {
  listContractUploads,
  listUnifiedContractUploads,
  saveContractUploads,
} from "../actions";
import type {
  SalesContractUploadRow,
  UnifiedContractUploadRow,
} from "@jarvis/shared/validation/sales-contract-extra";

type FilterState = {
  q: string;
  ym: string;
  companyCd: string;
  page: string;
};

type Props = {
  rows: SalesContractUploadRow[];
  total: number;
  unifiedRows: UnifiedContractUploadRow[];
  limit: number;
  initialFilters: FilterState;
};

const uploadColumns: ColumnDef<SalesContractUploadRow>[] = [
  { key: "ym", label: "년월", type: "text", width: 90, editable: true, required: true },
  { key: "companyCd", label: "회사코드", type: "text", width: 110, editable: true, required: true },
  { key: "companyNm", label: "회사명", type: "text", width: 180, editable: true },
  { key: "costCd", label: "코스트", type: "text", width: 110, editable: true, required: true },
  { key: "pjtCode", label: "프로젝트코드", type: "text", width: 130, editable: true, required: true },
  { key: "pjtNm", label: "프로젝트명", type: "text", width: 220, editable: true },
  { key: "productType", label: "제품군", type: "text", width: 100, editable: true, required: true },
  { key: "contType", label: "계약유형", type: "text", width: 100, editable: true, required: true },
  { key: "planServSaleAmt", label: "계획 서비스매출", type: "numeric", width: 130, editable: true },
  { key: "viewServSaleAmt", label: "전망 서비스매출", type: "numeric", width: 130, editable: true },
  { key: "perfServSaleAmt", label: "실적 서비스매출", type: "numeric", width: 130, editable: true },
  { key: "note", label: "비고", type: "textarea", width: 220, editable: true },
];

function makeBlankRow(): SalesContractUploadRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    ym: "",
    inOutType: null,
    costCd: "",
    costGrpNm: null,
    costNm: null,
    productType: "",
    contType: "",
    companyCd: "",
    companyNm: null,
    pjtCode: "",
    pjtNm: null,
    sucProb: null,
    planServSaleAmt: null,
    planProdSaleAmt: null,
    planInfSaleAmt: null,
    planServOutCostAmt: null,
    planProdCostAmt: null,
    planRentAmt: null,
    planExpAmt: null,
    planSgaAmt: null,
    planInCostAmt: null,
    planOutCostAmt: null,
    planIndirectGrpAmt: null,
    planIndirectComAmt: null,
    planInManMonth: null,
    planOutManMonth: null,
    viewServSaleAmt: null,
    viewProdSaleAmt: null,
    viewInfSaleAmt: null,
    viewServOutCostAmt: null,
    viewProdCostAmt: null,
    viewRentAmt: null,
    viewExpAmt: null,
    viewSgaAmt: null,
    viewInCostAmt: null,
    viewOutCostAmt: null,
    viewIndirectGrpAmt: null,
    viewIndirectComAmt: null,
    viewInManMonth: null,
    viewOutManMonth: null,
    perfServSaleAmt: null,
    perfProdSaleAmt: null,
    perfInfSaleAmt: null,
    perfServOutCostAmt: null,
    perfProdCostAmt: null,
    perfRentAmt: null,
    perfExpAmt: null,
    perfSgaAmt: null,
    perfInCostAmt: null,
    perfOutCostAmt: null,
    perfIndirectGrpAmt: null,
    perfIndirectComAmt: null,
    perfInManMonth: null,
    perfOutManMonth: null,
    note: null,
    createdAt: now,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ContractUploadsGridContainer({
  rows: initialRows,
  total: initialTotal,
  unifiedRows: initialUnifiedRows,
  limit,
  initialFilters,
}: Props) {
  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });
  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);
  const [rows, setRows] = useState(initialRows);
  const [unifiedRows, setUnifiedRows] = useState(initialUnifiedRows);
  const [total, setTotal] = useState(initialTotal);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((current) => ({ ...current, [key]: value }));

  const reload = useCallback(
    (nextPage: number, filters: FilterState) => {
      startTransition(async () => {
        const [uploadResult, unifiedResult] = await Promise.all([
          listContractUploads({
            q: filters.q || undefined,
            ym: filters.ym || undefined,
            companyCd: filters.companyCd || undefined,
            page: nextPage,
            limit,
          }),
          listUnifiedContractUploads({
            q: filters.q || undefined,
            ym: filters.ym || undefined,
            companyCd: filters.companyCd || undefined,
          }),
        ]);
        if (uploadResult.ok) {
          setRows(uploadResult.rows);
          setTotal(uploadResult.total);
        }
        if (unifiedResult.ok) setUnifiedRows(unifiedResult.rows);
      });
    },
    [limit],
  );

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("ym", pendingFilters.ym);
    setUrlFilter("companyCd", pendingFilters.companyCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadMessage(null);
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: selectedFile.size,
        }),
      });
      if (!presign.ok) throw new Error("presign failed");
      const { presignedUrl, objectKey } = await presign.json();

      const put = await fetch(presignedUrl, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type },
      });
      if (!put.ok) throw new Error("object upload failed");

      const finalized = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          filename: selectedFile.name,
          mimeType: selectedFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: selectedFile.size,
          resourceType: "sales_contract_upload",
        }),
      });
      if (!finalized.ok) throw new Error("upload finalize failed");

      setUploadMessage("업로드 원본이 raw_source로 등록되었습니다.");
      setSelectedFile(null);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <GridFilterField label="업로드 파일" className="w-[320px]">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className="h-8"
          />
        </GridFilterField>
        <Button type="button" size="sm" onClick={handleUpload} disabled={!selectedFile || isUploading}>
          {isUploading ? "업로드 중" : "업로드"}
        </Button>
        {uploadMessage ? <p className="text-sm text-(--fg-muted)">{uploadMessage}</p> : null}
      </div>

      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label="검색어" className="w-[240px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(event) => setPending("q", event.target.value)}
            placeholder="회사명 / 프로젝트명"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="년월" className="w-[120px]">
          <Input
            type="text"
            value={pendingFilters.ym}
            onChange={(event) => setPending("ym", event.target.value)}
            placeholder="202604"
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

      <DataGrid<SalesContractUploadRow>
        rows={rows}
        total={total}
        columns={uploadColumns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onPageChange={(page) => {
          setUrlFilter("page", String(page));
          reload(page, { ...urlFilters, page: String(page) });
        }}
        onFilterChange={() => undefined}
        onSave={async (changes) => {
          const result = await saveContractUploads({
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-(--fg-primary)">통합 검색 결과</h2>
        <div className="overflow-x-auto rounded-md border border-(--border-default)">
          <table className="min-w-full text-sm">
            <thead className="bg-(--bg-muted) text-left text-(--fg-muted)">
              <tr>
                <th className="px-3 py-2">출처</th>
                <th className="px-3 py-2">년월</th>
                <th className="px-3 py-2">회사</th>
                <th className="px-3 py-2">프로젝트</th>
                <th className="px-3 py-2">계획</th>
                <th className="px-3 py-2">전망</th>
                <th className="px-3 py-2">실적</th>
              </tr>
            </thead>
            <tbody>
              {unifiedRows.map((row) => (
                <tr key={`${row.sourceTable}-${row.id}`} className="border-t border-(--border-default)">
                  <td className="px-3 py-2">{row.sourceTable}</td>
                  <td className="px-3 py-2">{row.ym}</td>
                  <td className="px-3 py-2">{row.companyNm ?? row.companyCd ?? ""}</td>
                  <td className="px-3 py-2">{row.pjtNm ?? row.pjtCode ?? ""}</td>
                  <td className="px-3 py-2">{row.planServSaleAmt ?? ""}</td>
                  <td className="px-3 py-2">{row.viewServSaleAmt ?? ""}</td>
                  <td className="px-3 py-2">{row.perfServSaleAmt ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
