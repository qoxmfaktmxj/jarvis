"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef } from "@/components/grid/types";
import { listContracts, saveContracts } from "../actions";
import { exportContractsToExcel } from "../export";
import type { SalesContractRow } from "@jarvis/shared/validation/sales-contract";
import { contractsColumns } from "./columns";

type FilterState = {
  q: string;
  customerNo: string;
  contGbCd: string;
  page: string;
};

type Props = {
  rows: SalesContractRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesContractRow {
  const id = crypto.randomUUID();
  return {
    id,
    workspaceId: "",
    legacyEnterCd: null,
    legacyContYear: null,
    legacyContNo: null,
    companyType: null,
    companyCd: null,
    companyGrpNm: null,
    companyNm: null,
    companyNo: null,
    customerNo: null,
    customerEmail: null,
    contNm: null,
    custNm: null,
    contGbCd: null,
    contYmd: null,
    contSymd: null,
    contEymd: null,
    mainContType: null,
    newYn: null,
    inOutType: null,
    startAmt: null,
    startAmtRate: null,
    interimAmt1: null,
    interimAmt2: null,
    interimAmt3: null,
    interimAmt4: null,
    interimAmt5: null,
    interimAmtRate1: null,
    interimAmtRate2: null,
    interimAmtRate3: null,
    interimAmtRate4: null,
    interimAmtRate5: null,
    remainAmt: null,
    remainAmtRate: null,
    contImplYn: null,
    contPublYn: null,
    contGrtRate: null,
    advanImplYn: null,
    advanPublYn: null,
    advanGrtRate: null,
    defectImplYn: null,
    defectPublYn: null,
    defectGrtRate: null,
    defectEymd: null,
    inspecConfYmd: null,
    startAmtPlanYmd: null,
    startAmtPublYn: null,
    interimAmtPlanYmd1: null,
    interimAmtPublYn1: null,
    interimAmtPlanYmd2: null,
    interimAmtPublYn2: null,
    interimAmtPlanYmd3: null,
    interimAmtPublYn3: null,
    interimAmtPlanYmd4: null,
    interimAmtPublYn4: null,
    interimAmtPlanYmd5: null,
    interimAmtPublYn5: null,
    remainAmtPlanYmd: null,
    remainAmtPublYn: null,
    befContNo: null,
    contCancelYn: null,
    contInitYn: null,
    fileSeq: null,
    docNo: null,
    companyAddr: null,
    companyOner: null,
    sucProb: null,
    memo: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ContractsGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Sales.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<SalesContractRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useState<FilterState>({
    q: initialFilters.q,
    customerNo: initialFilters.customerNo,
    contGbCd: initialFilters.contGbCd,
    page: initialFilters.page,
  });
  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listContracts({
          q: nextFilters.q || undefined,
          customerNo: nextFilters.customerNo || undefined,
          contGbCd: nextFilters.contGbCd || undefined,
          page: nextPage,
          limit,
        });
        if (res.ok) {
          setRows(res.rows as SalesContractRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  // Visible columns for the grid (JSP Hidden:0 equivalent)
  const COLUMNS: ColumnDef<SalesContractRow>[] = contractsColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportContractsToExcel({
        q: urlFilters.q || undefined,
        customerNo: urlFilters.customerNo || undefined,
        contGbCd: urlFilters.contGbCd || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        toast({
          variant: "destructive",
          title: t("Excel.exportFailed"),
          description: t("Excel.exportFailedDesc", { message: result.error ?? "" }),
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("customerNo", pendingFilters.customerNo);
    setUrlFilter("contGbCd", pendingFilters.contGbCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, setUrlFilter, reload]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label="검색어" className="w-[240px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="계약명 / 고객명 / 계약번호"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="담당자번호" className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.customerNo}
            onChange={(e) => setPending("customerNo", e.target.value)}
            placeholder="담당자번호"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("Search.searchDevGbCd")} className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.contGbCd}
            onChange={(e) => setPending("contGbCd", e.target.value)}
            placeholder="계약구분코드"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesContractRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/contracts/" + row.id + "/edit")}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={() => {
          // Filters managed by GridSearchForm above
        }}
        onSave={async (changes) => {
          // Composite-key validation: (workspaceId + legacyEnterCd + legacyContYear + legacyContNo) is UNIQUE.
          // UI dedup guard on legacy composite key before sending to server.
          const allRows = [
            ...changes.creates,
            ...rows
              .filter((r) => !changes.deletes.includes(r.id))
              .map((r) => {
                const upd = changes.updates.find((u) => u.id === r.id);
                return upd ? { ...r, ...upd.patch } : r;
              }),
          ];
          const dupes = findDuplicateKeys(allRows, [
            "legacyEnterCd",
            "legacyContYear",
            "legacyContNo",
          ]);
          if (dupes.length > 0) {
            return {
              ok: false as const,
              errors: dupes.map((k) => ({
                message: `중복된 계약키(enterCd|contYear|contNo)가 있습니다: ${k}`,
              })),
            };
          }
          const result = await saveContracts(changes);
          if (result.ok) reload(currentPage, urlFilters);
          // Adapt saveContracts response shape to GridSaveResult
          return {
            ok: result.ok,
            ...(result.errors && result.errors.length > 0
              ? { errors: result.errors.map((e) => ({ message: e.message })) }
              : {}),
          };
        }}
      />
    </div>
  );
}
