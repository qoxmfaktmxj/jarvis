"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { SalesCloudPeopleCalcRow } from "@jarvis/shared/validation/sales-people";
import { listCloudPeopleCalc, saveCloudPeopleCalc } from "../actions";
import { exportCloudPeopleCalcToExcel } from "../export";
import { getCloudPeopleCalcColumns } from "./columns";

type FilterState = {
  q: string;
  contYear: string;
  ym: string;
  personType: string;
  calcType: string;
  page: string;
};

type Props = {
  rows: SalesCloudPeopleCalcRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function makeBlankRow(): SalesCloudPeopleCalcRow {
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
    ym: currentYm(),
    reflYn: null,
    personType: "",
    calcType: "",
    monthAmt: null,
    personCnt: null,
    totalAmt: null,
    note: null,
    reflId: null,
    reflDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function CloudPeopleCalcGridContainer({ rows: initialRows, total: initialTotal, limit, initialFilters }: Props) {
  const t = useTranslations("Sales.CloudPeopleCalc");
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
      getCloudPeopleCalcColumns({
        legacyEnterCd: t("columns.legacyEnterCd"),
        contYear: t("columns.contYear"),
        contNo: t("columns.contNo"),
        contNm: t("columns.contNm"),
        pjtCode: t("columns.pjtCode"),
        pjtNm: t("columns.pjtNm"),
        companyCd: t("columns.companyCd"),
        companyNm: t("columns.companyNm"),
        ym: t("columns.ym"),
        reflYn: t("columns.reflYn"),
        personType: t("columns.personType"),
        calcType: t("columns.calcType"),
        monthAmt: t("columns.monthAmt"),
        personCnt: t("columns.personCnt"),
        totalAmt: t("columns.totalAmt"),
        note: t("columns.note"),
        seq: t("columns.seq"),
        reflId: t("columns.reflId"),
        reflDate: t("columns.reflDate"),
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
        const res = await listCloudPeopleCalc({
          q: nextFilters.q || undefined,
          contYear: nextFilters.contYear || undefined,
          ym: nextFilters.ym || undefined,
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
    setUrlFilter("ym", pendingFilters.ym);
    setUrlFilter("personType", pendingFilters.personType);
    setUrlFilter("calcType", pendingFilters.calcType);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportCloudPeopleCalcToExcel({
        q: urlFilters.q || undefined,
        contYear: urlFilters.contYear || undefined,
        ym: urlFilters.ym || undefined,
        personType: urlFilters.personType || undefined,
        calcType: urlFilters.calcType || undefined,
      });
      if (result.ok) triggerDownload(result.bytes, result.filename);
      else alert(result.error);
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
        <GridFilterField label={t("filters.ym")} className="w-[110px]">
          <Input className="h-8" value={pendingFilters.ym} onChange={(e) => setPending("ym", e.target.value)} placeholder="202604" />
        </GridFilterField>
        <GridFilterField label={t("filters.personType")} className="w-[110px]">
          <Input className="h-8" value={pendingFilters.personType} onChange={(e) => setPending("personType", e.target.value)} />
        </GridFilterField>
        <GridFilterField label={t("filters.calcType")} className="w-[110px]">
          <Input className="h-8" value={pendingFilters.calcType} onChange={(e) => setPending("calcType", e.target.value)} />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<SalesCloudPeopleCalcRow>
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
          const dupes = findDuplicateKeys(allRows, ["legacyEnterCd", "contNo", "contYear", "seq", "personType", "calcType", "ym"]);
          if (dupes.length > 0) {
            return { ok: false, errors: dupes.map((k) => ({ message: t("errors.duplicate", { keys: k }) })) };
          }
          const result = await saveCloudPeopleCalc(changes);
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
