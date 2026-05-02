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
import type { ProjectModuleRow } from "@jarvis/shared/validation/project";
import { listProjectModules, saveProjectModules } from "../actions";
import { exportProjectModulesToExcel } from "../export";
import { moduleColumns } from "./columns";

type FilterState = {
  q: string;
  pjtCd: string;
  sabun: string;
  moduleCd: string;
  page: string;
};

type Props = {
  rows: ProjectModuleRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): ProjectModuleRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    legacySabun: null,
    legacyPjtCd: null,
    legacyModuleCd: null,
    sabun: null,
    pjtCd: null,
    pjtNm: null,
    moduleCd: null,
    moduleNm: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ModulesGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.Modules");
  const common = useTranslations("Projects.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });
  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<ProjectModuleRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listProjectModules({
          q: nextFilters.q || undefined,
          pjtCd: nextFilters.pjtCd || undefined,
          sabun: nextFilters.sabun || undefined,
          moduleCd: nextFilters.moduleCd || undefined,
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

  const columns: ColumnDef<ProjectModuleRow>[] = moduleColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportProjectModulesToExcel({
        q: urlFilters.q || undefined,
        pjtCd: urlFilters.pjtCd || undefined,
        sabun: urlFilters.sabun || undefined,
        moduleCd: urlFilters.moduleCd || undefined,
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
    setUrlFilter("moduleCd", next.moduleCd);
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
        <GridFilterField label={t("filters.employee")} className="w-[130px]">
          <Input
            value={pendingFilters.sabun}
            onChange={(e) => setPending("sabun", e.target.value)}
            placeholder={t("filters.employee")}
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
        <GridFilterField label={t("filters.moduleCode")} className="w-[130px]">
          <Input
            value={pendingFilters.moduleCd}
            onChange={(e) => setPending("moduleCd", e.target.value)}
            placeholder={t("filters.moduleCode")}
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<ProjectModuleRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push(`/projects/modules?selected=${row.id}`)}
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
          const result = await saveProjectModules(changes);
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
