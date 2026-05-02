"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef } from "@/components/grid/types";
import type { ProjectHistoryRow } from "@jarvis/shared/validation/project";
import { listProjectHistory, saveProjectHistory } from "../actions";
import { exportProjectHistoryToExcel } from "../export";
import { historyColumns } from "./columns";

type FilterState = {
  q: string;
  pjtCd: string;
  sabun: string;
  orgCd: string;
  roleCd: string;
  statusCd: string;
  baseSymd: string;
  baseEymd: string;
  page: string;
};

type Props = {
  rows: ProjectHistoryRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): ProjectHistoryRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    legacySabun: null,
    legacyOrgCd: null,
    legacyPjtCd: null,
    sabun: null,
    orgCd: null,
    pjtCd: null,
    pjtNm: null,
    custCd: null,
    custNm: null,
    sdate: null,
    edate: null,
    regCd: null,
    regNm: null,
    deReg: null,
    flist: null,
    plist: null,
    roleCd: null,
    roleNm: null,
    module: null,
    workHours: null,
    memo: null,
    etc1: null,
    etc2: null,
    etc3: null,
    etc4: null,
    etc5: null,
    jobCd: null,
    jobNm: null,
    rewardYn: null,
    statusCd: null,
    beaconMcd: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function HistoryGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.History");
  const common = useTranslations("Projects.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });
  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<ProjectHistoryRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listProjectHistory({
          q: nextFilters.q || undefined,
          pjtCd: nextFilters.pjtCd || undefined,
          sabun: nextFilters.sabun || undefined,
          orgCd: nextFilters.orgCd || undefined,
          roleCd: nextFilters.roleCd || undefined,
          statusCd: nextFilters.statusCd || undefined,
          baseSymd: nextFilters.baseSymd || undefined,
          baseEymd: nextFilters.baseEymd || undefined,
          page: nextPage,
          limit,
        });
        if (res.ok) {
          setRows(res.rows);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  const columns: ColumnDef<ProjectHistoryRow>[] = historyColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportProjectHistoryToExcel({
        q: urlFilters.q || undefined,
        pjtCd: urlFilters.pjtCd || undefined,
        sabun: urlFilters.sabun || undefined,
        orgCd: urlFilters.orgCd || undefined,
        roleCd: urlFilters.roleCd || undefined,
        statusCd: urlFilters.statusCd || undefined,
        baseSymd: urlFilters.baseSymd || undefined,
        baseEymd: urlFilters.baseEymd || undefined,
      });
      if (result.ok) triggerDownload(result.bytes, result.filename);
      else
        toast({
          variant: "destructive",
          title: common("excel.exportFailed"),
          description: common("excel.exportFailedDesc", { message: result.error }),
        });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = useCallback(() => {
    const next = { ...pendingFilters, page: "1" };
    (Object.keys(next) as (keyof FilterState)[]).forEach((key) => {
      setUrlFilter(key, next[key]);
    });
    reload(1, next);
  }, [pendingFilters, reload, setUrlFilter]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label={common("search")} className="w-[220px]">
          <Input
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.periodFrom")} className="w-[130px]">
          <Input
            value={pendingFilters.baseSymd}
            onChange={(e) => setPending("baseSymd", e.target.value)}
            placeholder="YYYYMMDD"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.periodTo")} className="w-[130px]">
          <Input
            value={pendingFilters.baseEymd}
            onChange={(e) => setPending("baseEymd", e.target.value)}
            placeholder="YYYYMMDD"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.employee")} className="w-[120px]">
          <Input
            value={pendingFilters.sabun}
            onChange={(e) => setPending("sabun", e.target.value)}
            placeholder={t("filters.employee")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.projectCode")} className="w-[140px]">
          <Input
            value={pendingFilters.pjtCd}
            onChange={(e) => setPending("pjtCd", e.target.value)}
            placeholder={t("filters.projectCode")}
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<ProjectHistoryRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push(`/projects/history?selected=${row.id}`)}
        onExport={handleExport}
        isExporting={isExporting}
        exportLabel={common("excel.button")}
        exportingLabel={common("excel.downloading")}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={() => {}}
        onSave={async (changes) => {
          const result = await saveProjectHistory(changes);
          if (result.ok) reload(currentPage, urlFilters);
          return {
            ok: result.ok,
            ...(result.error ? { errors: [{ message: result.error }] } : {}),
          };
        }}
      />
    </div>
  );
}
