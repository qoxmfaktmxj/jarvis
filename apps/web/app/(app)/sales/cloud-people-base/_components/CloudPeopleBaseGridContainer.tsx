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
import type { SalesCloudPeopleBaseRow } from "@jarvis/shared/validation/sales-people";
import { listCloudPeopleBase, saveCloudPeopleBase } from "../actions";
import { exportCloudPeopleBaseToExcel } from "../export";
import { getCloudPeopleBaseColumns } from "./columns";

type FilterState = {
  q: string;
  contYear: string;
  pjtCode: string;
  personType: string;
  calcType: string;
  page: string;
};

type Props = {
  rows: SalesCloudPeopleBaseRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeBlankRow(): SalesCloudPeopleBaseRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    contNo: "",
    contYear: String(new Date().getFullYear()),
    seq: 0,
    contNm: null,
    pjtCode: null,
    pjtNm: null,
    companyCd: null,
    companyNm: null,
    personType: "",
    calcType: "",
    sdate: todayYmd(),
    edate: null,
    monthAmt: null,
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function CloudPeopleBaseGridContainer({ rows: initialRows, total: initialTotal, limit, initialFilters }: Props) {
  const t = useTranslations("Sales.CloudPeopleBase");
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
      getCloudPeopleBaseColumns({
        legacyEnterCd: t("columns.legacyEnterCd"),
        contYear: t("columns.contYear"),
        contNo: t("columns.contNo"),
        contNm: t("columns.contNm"),
        pjtCode: t("columns.pjtCode"),
        pjtNm: t("columns.pjtNm"),
        companyCd: t("columns.companyCd"),
        companyNm: t("columns.companyNm"),
        personType: t("columns.personType"),
        calcType: t("columns.calcType"),
        sdate: t("columns.sdate"),
        edate: t("columns.edate"),
        monthAmt: t("columns.monthAmt"),
        note: t("columns.note"),
        seq: t("columns.seq"),
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
        const res = await listCloudPeopleBase({
          q: nextFilters.q || undefined,
          contYear: nextFilters.contYear || undefined,
          pjtCode: nextFilters.pjtCode || undefined,
          personType: nextFilters.personType || undefined,
          calcType: nextFilters.calcType || undefined,
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
    setUrlFilter("contYear", pendingFilters.contYear);
    setUrlFilter("pjtCode", pendingFilters.pjtCode);
    setUrlFilter("personType", pendingFilters.personType);
    setUrlFilter("calcType", pendingFilters.calcType);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportCloudPeopleBaseToExcel({
        q: urlFilters.q || undefined,
        contYear: urlFilters.contYear || undefined,
        pjtCode: urlFilters.pjtCode || undefined,
        personType: urlFilters.personType || undefined,
        calcType: urlFilters.calcType || undefined,
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
        <GridFilterField label={t("filters.contYear")} className="w-[100px]">
          <Input className="h-8" value={pendingFilters.contYear} onChange={(e) => setPending("contYear", e.target.value)} placeholder="2026" />
        </GridFilterField>
        <GridFilterField label={t("filters.pjtCode")} className="w-[130px]">
          <Input className="h-8" value={pendingFilters.pjtCode} onChange={(e) => setPending("pjtCode", e.target.value)} />
        </GridFilterField>
        <GridFilterField label={t("filters.personType")} className="w-[110px]">
          <Input className="h-8" value={pendingFilters.personType} onChange={(e) => setPending("personType", e.target.value)} />
        </GridFilterField>
        <GridFilterField label={t("filters.calcType")} className="w-[110px]">
          <Input className="h-8" value={pendingFilters.calcType} onChange={(e) => setPending("calcType", e.target.value)} />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesCloudPeopleBaseRow>
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
          const dupes = findDuplicateKeys(allRows, ["legacyEnterCd", "contNo", "contYear", "seq", "personType", "calcType", "sdate"]);
          if (dupes.length > 0) {
            return { ok: false, errors: dupes.map((k) => ({ message: t("errors.duplicate", { keys: k }) })) };
          }
          const result = await saveCloudPeopleBase(changes);
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
