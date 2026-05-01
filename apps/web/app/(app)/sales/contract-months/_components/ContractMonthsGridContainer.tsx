"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { listContractMonths, saveContractMonths } from "../actions";
import { exportContractMonthsToExcel } from "../export";
import type { SalesContractMonthRow } from "@jarvis/shared/validation/sales-contract";
import { contractMonthsColumns, contractMonthsGroupHeaders } from "./columns";

type FilterState = {
  q: string;
  contractId: string;
  ym: string;
  page: string;
};

type Props = {
  rows: SalesContractMonthRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesContractMonthRow {
  const id = crypto.randomUUID();
  return {
    id,
    workspaceId: "",
    contractId: "",
    legacyContYear: null,
    legacyContNo: null,
    legacySeq: null,
    legacyYm: null,
    ym: "",
    billTargetYn: null,
    // PLAN
    planInManMonth: null,
    planOutManMonth: null,
    planServSaleAmt: null,
    planProdSaleAmt: null,
    planInfSaleAmt: null,
    planServInCostAmt: null,
    planServOutCostAmt: null,
    planProdCostAmt: null,
    planInCostAmt: null,
    planOutCostAmt: null,
    planIndirectGrpAmt: null,
    planIndirectComAmt: null,
    planRentAmt: null,
    planSgaAmt: null,
    planExpAmt: null,
    // VIEW
    viewInManMonth: null,
    viewOutManMonth: null,
    viewServSaleAmt: null,
    viewProdSaleAmt: null,
    viewInfSaleAmt: null,
    viewServInCostAmt: null,
    viewServOutCostAmt: null,
    viewProdCostAmt: null,
    viewInCostAmt: null,
    viewOutCostAmt: null,
    viewIndirectGrpAmt: null,
    viewIndirectComAmt: null,
    viewRentAmt: null,
    viewSgaAmt: null,
    viewExpAmt: null,
    // PERF
    perfInManMonth: null,
    perfOutManMonth: null,
    perfServSaleAmt: null,
    perfProdSaleAmt: null,
    perfInfSaleAmt: null,
    perfServInCostAmt: null,
    perfServOutCostAmt: null,
    perfProdCostAmt: null,
    perfInCostAmt: null,
    perfOutCostAmt: null,
    perfIndirectGrpAmt: null,
    perfIndirectComAmt: null,
    perfRentAmt: null,
    perfSgaAmt: null,
    perfExpAmt: null,
    // Tax
    taxOrderAmt: null,
    taxServAmt: null,
    // Finalize
    rfcEndYn: null,
    note: null,
    // Audit
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ContractMonthsGridContainer({
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

  const [rows, setRows] = useState<SalesContractMonthRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useState<FilterState>({
    q: initialFilters.q,
    contractId: initialFilters.contractId,
    ym: initialFilters.ym,
    page: initialFilters.page,
  });
  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listContractMonths({
          q: nextFilters.q || undefined,
          contractId: nextFilters.contractId || undefined,
          ym: nextFilters.ym || undefined,
          page: nextPage,
          limit,
        });
        if (res.ok) {
          setRows(res.rows as SalesContractMonthRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportContractMonthsToExcel({
        q: urlFilters.q || undefined,
        contractId: urlFilters.contractId || undefined,
        ym: urlFilters.ym || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        alert(result.error);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("contractId", pendingFilters.contractId);
    setUrlFilter("ym", pendingFilters.ym);
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
            placeholder="메모 검색"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="계약ID" className="w-[280px]">
          <Input
            type="text"
            value={pendingFilters.contractId}
            onChange={(e) => setPending("contractId", e.target.value)}
            placeholder="계약 UUID"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="년월" className="w-[120px]">
          <Input
            type="text"
            value={pendingFilters.ym}
            onChange={(e) => setPending("ym", e.target.value)}
            placeholder="예: 202604"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesContractMonthRow>
        rows={rows}
        total={total}
        columns={contractMonthsColumns}
        groupHeaders={contractMonthsGroupHeaders}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/contract-months/" + row.id + "/edit")}
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
          // Composite-key dedup: (contractId + ym) should be unique per month row.
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
            "legacyContYear",
            "legacyContNo",
            "legacySeq",
            "legacyYm",
          ]);
          if (dupes.length > 0) {
            return {
              ok: false as const,
              errors: dupes.map((k) => ({
                message: `중복된 월별계약키(contYear|contNo|seq|ym)가 있습니다: ${k}`,
              })),
            };
          }
          const result = await saveContractMonths(changes);
          if (result.ok) reload(currentPage, urlFilters);
          // Adapt saveContractMonths response shape to GridSaveResult
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
