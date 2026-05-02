"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { SalesFreelancerRow } from "@jarvis/shared/validation/sales-people";
import { exportFreelancersToExcel } from "../export";
import { listFreelancers, saveFreelancers } from "../actions";
import { getFreelancerColumns } from "./columns";

type FilterState = {
  q: string;
  belongYm: string;
  businessCd: string;
  page: string;
};

type Props = {
  rows: SalesFreelancerRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function previousMonthYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function makeBlankRow(): SalesFreelancerRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    sabun: "",
    name: null,
    resNo: null,
    pjtCd: null,
    pjtNm: null,
    sdate: null,
    edate: null,
    addr: null,
    tel: null,
    mailId: null,
    belongYm: previousMonthYm(),
    businessCd: "940926",
    totMon: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function FreelancersGridContainer({ rows: initialRows, total: initialTotal, limit, initialFilters }: Props) {
  const t = useTranslations("Sales.Freelancers");
  const common = useTranslations("Sales.Common");
  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);

  const columns = useMemo(
    () =>
      getFreelancerColumns({
        legacyEnterCd: t("columns.legacyEnterCd"),
        sabun: t("columns.sabun"),
        name: t("columns.name"),
        pjtCd: t("columns.pjtCd"),
        pjtNm: t("columns.pjtNm"),
        sdate: t("columns.sdate"),
        edate: t("columns.edate"),
        resNo: t("columns.resNo"),
        addr: t("columns.addr"),
        tel: t("columns.tel"),
        mailId: t("columns.mailId"),
        belongYm: t("columns.belongYm"),
        businessCd: t("columns.businessCd"),
        totMon: t("columns.totMon"),
        updatedBy: t("columns.updatedBy"),
        updatedAt: t("columns.updatedAt"),
      }),
    [t],
  );

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listFreelancers({
          q: nextFilters.q || undefined,
          belongYm: nextFilters.belongYm || undefined,
          businessCd: nextFilters.businessCd || undefined,
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

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("belongYm", pendingFilters.belongYm);
    setUrlFilter("businessCd", pendingFilters.businessCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportFreelancersToExcel({
        q: urlFilters.q || undefined,
        belongYm: urlFilters.belongYm || undefined,
        businessCd: urlFilters.businessCd || undefined,
      });
      if (result.ok) triggerDownload(result.bytes, result.filename);
      else
        toast({
          variant: "destructive",
          title: common("Excel.exportFailed"),
          description: common("Excel.exportFailedDesc", { message: result.error ?? "" }),
        });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label={t("filters.q")} className="w-[220px]">
          <Input className="h-8" value={pendingFilters.q} onChange={(e) => setPending("q", e.target.value)} placeholder={t("filters.qPlaceholder")} />
        </GridFilterField>
        <GridFilterField label={t("filters.belongYm")} className="w-[120px]">
          <Input className="h-8" value={pendingFilters.belongYm} onChange={(e) => setPending("belongYm", e.target.value)} placeholder="202604" />
        </GridFilterField>
        <GridFilterField label={t("filters.businessCd")} className="w-[140px]">
          <Input className="h-8" value={pendingFilters.businessCd} onChange={(e) => setPending("businessCd", e.target.value)} placeholder="940926" />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesFreelancerRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onExport={handleExport}
        isExporting={isExporting}
        exportLabel={common("Excel.button")}
        exportingLabel={common("Excel.downloading")}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={() => {}}
        onSave={async (changes) => {
          const allRows = [
            ...changes.creates,
            ...rows
              .filter((r) => !changes.deletes.includes(r.id))
              .map((r) => {
                const update = changes.updates.find((u) => u.id === r.id);
                return update ? { ...r, ...update.patch } : r;
              }),
          ];
          const dupes = findDuplicateKeys(allRows, ["sabun", "belongYm", "businessCd"]);
          if (dupes.length > 0) {
            return { ok: false, errors: dupes.map((k) => ({ message: t("errors.duplicate", { keys: k }) })) };
          }
          const result = await saveFreelancers(changes);
          if (result.ok) reload(currentPage, urlFilters);
          return {
            ok: result.ok,
            ...(result.errors ? { errors: result.errors.map((e) => ({ message: e.message })) } : {}),
          };
        }}
      />
    </div>
  );
}
