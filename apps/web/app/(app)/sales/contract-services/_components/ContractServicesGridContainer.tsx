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
import type { ColumnDef } from "@/components/grid/types";
import { listContractServices, saveContractServices } from "../actions";
import { exportContractServicesToExcel } from "../export";
import type { SalesContractServiceRow } from "@jarvis/shared/validation/sales-contract";
import { contractServicesColumns } from "./columns";

type FilterState = {
  q: string;
  pjtCd: string;
  attendCd: string;
  page: string;
};

type Props = {
  rows: SalesContractServiceRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesContractServiceRow {
  const id = crypto.randomUUID();
  return {
    id,
    workspaceId: "",
    legacyEnterCd: null,
    legacySymd: null,
    legacyServSabun: null,
    servSabun: "",
    servName: null,
    birYmd: null,
    symd: null,
    eymd: null,
    cpyGbCd: null,
    cpyName: null,
    econtAmt: null,
    econtCnt: null,
    job: null,
    tel: null,
    mail: null,
    addr: null,
    attendCd: null,
    skillCd: null,
    cmmncCd: null,
    rsponsCd: null,
    memo1: null,
    memo2: null,
    memo3: null,
    orgCd: null,
    manager: null,
    pjtCd: null,
    pjtNm: null,
    etc1: null,
    etc2: null,
    etc3: null,
    etc4: null,
    etc5: null,
    etc6: null,
    etc7: null,
    etc8: null,
    etc9: null,
    etc10: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ContractServicesGridContainer({
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

  const [rows, setRows] = useState<SalesContractServiceRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useState<FilterState>({
    q: initialFilters.q,
    pjtCd: initialFilters.pjtCd,
    attendCd: initialFilters.attendCd,
    page: initialFilters.page,
  });
  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listContractServices({
          q: nextFilters.q || undefined,
          pjtCd: nextFilters.pjtCd || undefined,
          attendCd: nextFilters.attendCd || undefined,
          page: nextPage,
          limit,
        });
        if (res.ok) {
          setRows(res.rows as SalesContractServiceRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  const COLUMNS: ColumnDef<SalesContractServiceRow>[] = contractServicesColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportContractServicesToExcel({
        q: urlFilters.q || undefined,
        pjtCd: urlFilters.pjtCd || undefined,
        attendCd: urlFilters.attendCd || undefined,
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
    setUrlFilter("pjtCd", pendingFilters.pjtCd);
    setUrlFilter("attendCd", pendingFilters.attendCd);
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
            placeholder="이름 / 직무 / 사번"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="프로젝트코드" className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.pjtCd}
            onChange={(e) => setPending("pjtCd", e.target.value)}
            placeholder="프로젝트코드"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="근태코드" className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.attendCd}
            onChange={(e) => setPending("attendCd", e.target.value)}
            placeholder="근태코드"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesContractServiceRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/contract-services/" + row.id + "/edit")}
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
          // Composite-key dedup guard: (legacyEnterCd|legacySymd|legacyServSabun) is UNIQUE.
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
            "legacySymd",
            "legacyServSabun",
          ]);
          if (dupes.length > 0) {
            return {
              ok: false as const,
              errors: dupes.map((k) => ({
                message: `중복된 용역키(enterCd|symd|servSabun)가 있습니다: ${k}`,
              })),
            };
          }
          const result = await saveContractServices(changes);
          if (result.ok) reload(currentPage, urlFilters);
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
