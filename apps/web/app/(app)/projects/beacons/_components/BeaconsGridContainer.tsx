"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { YnSelectFilter } from "@/components/grid/YnSelectFilter";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef } from "@/components/grid/types";
import type { ProjectBeaconRow } from "@jarvis/shared/validation/project";
import { listProjectBeacons, saveProjectBeacons } from "../actions";
import { exportProjectBeaconsToExcel } from "../export";
import { beaconColumns } from "./columns";

type FilterState = {
  q: string;
  pjtCd: string;
  sabun: string;
  outYn: string;
  page: string;
};

type Props = {
  rows: ProjectBeaconRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): ProjectBeaconRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    legacyBeaconMcd: null,
    legacyBeaconSer: null,
    beaconMcd: null,
    beaconSer: null,
    pjtCd: null,
    pjtNm: null,
    sdate: null,
    edate: null,
    sabun: null,
    outYn: null,
    bigo: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function BeaconsGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.Beacons");
  const common = useTranslations("Projects.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });
  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<ProjectBeaconRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listProjectBeacons({
          q: nextFilters.q || undefined,
          pjtCd: nextFilters.pjtCd || undefined,
          sabun: nextFilters.sabun || undefined,
          outYn: nextFilters.outYn || undefined,
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

  const columns: ColumnDef<ProjectBeaconRow>[] = beaconColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportProjectBeaconsToExcel({
        q: urlFilters.q || undefined,
        pjtCd: urlFilters.pjtCd || undefined,
        sabun: urlFilters.sabun || undefined,
        outYn: urlFilters.outYn || undefined,
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
    setUrlFilter("q", next.q);
    setUrlFilter("pjtCd", next.pjtCd);
    setUrlFilter("sabun", next.sabun);
    setUrlFilter("outYn", next.outYn);
    setUrlFilter("page", "1");
    reload(1, next);
  }, [pendingFilters, reload, setUrlFilter]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label={common("search")} className="w-[240px]">
          <Input
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.projectCode")} className="w-[150px]">
          <Input
            value={pendingFilters.pjtCd}
            onChange={(e) => setPending("pjtCd", e.target.value)}
            placeholder={t("filters.projectCode")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.employee")} className="w-[130px]">
          <Input
            value={pendingFilters.sabun}
            onChange={(e) => setPending("sabun", e.target.value)}
            placeholder={t("filters.employee")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("filters.outYn")} className="w-[100px]">
          <YnSelectFilter
            value={pendingFilters.outYn}
            onChange={(v) => setPending("outYn", v)}
            allLabel={common("yn.all")}
            yLabel={common("yn.y")}
            nLabel={common("yn.n")}
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<ProjectBeaconRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push(`/projects/beacons?selected=${row.id}`)}
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
          const result = await saveProjectBeacons(changes);
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
