"use client";

import { useCallback, useMemo, useState, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { toast } from "@/hooks/use-toast";
import type { SalesPlanPerfRow } from "@jarvis/shared/validation/sales-charts";
import { listPlanPerfUpload, savePlanPerfUpload, uploadPlanPerfExcel } from "../actions";
import { downloadPlanPerfTemplate, exportPlanPerfUploadToExcel } from "../export";
import { getPlanPerfUploadColumns } from "./columns";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

type FilterState = {
  q: string;
  ym: string;
  orgCd: string;
  gubunCd: string;
  trendGbCd: string;
  page: string;
};

type Props = {
  rows: SalesPlanPerfRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesPlanPerfRow {
  const d = new Date();
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    ym: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`,
    orgCd: "",
    orgNm: "",
    gubunCd: "PLAN",
    trendGbCd: "SALES",
    amt: 0,
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function PlanPerfUploadGridContainer({ rows: initialRows, total: initialTotal, limit, initialFilters }: Props) {
  const t = useTranslations("Sales.Charts.PlanPerfUpload");
  const common = useTranslations("Sales.Common");
  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({ defaults: initialFilters });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const columns = useMemo(
    () => getPlanPerfUploadColumns({
      ym: t("columns.ym"),
      orgCd: t("columns.orgCd"),
      orgNm: t("columns.orgNm"),
      gubunCd: t("columns.gubunCd"),
      trendGbCd: t("columns.trendGbCd"),
      amt: t("columns.amt"),
      note: t("columns.note"),
      updatedBy: t("columns.updatedBy"),
      updatedAt: t("columns.updatedAt"),
    }),
    [t],
  );

  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback((nextPage: number, nextFilters: FilterState) => {
    startTransition(async () => {
      const res = await listPlanPerfUpload({
        q: nextFilters.q || undefined,
        ym: nextFilters.ym || undefined,
        orgCd: nextFilters.orgCd || undefined,
        gubunCd: nextFilters.gubunCd || undefined,
        trendGbCd: nextFilters.trendGbCd || undefined,
        page: nextPage,
        limit,
      });
      if (res.ok) {
        setRows(res.rows);
        setTotal(res.total);
      }
    });
  }, [limit]);

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("ym", pendingFilters.ym);
    setUrlFilter("orgCd", pendingFilters.orgCd);
    setUrlFilter("gubunCd", pendingFilters.gubunCd);
    setUrlFilter("trendGbCd", pendingFilters.trendGbCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, reload, setUrlFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportPlanPerfUploadToExcel({
        q: urlFilters.q || undefined,
        ym: urlFilters.ym || undefined,
        orgCd: urlFilters.orgCd || undefined,
        gubunCd: urlFilters.gubunCd as SalesPlanPerfRow["gubunCd"] | undefined || undefined,
        trendGbCd: urlFilters.trendGbCd as SalesPlanPerfRow["trendGbCd"] | undefined || undefined,
      });
      if (result.ok) triggerDownload(result.bytes, result.filename);
      else toast({ title: "다운로드 실패", description: result.error });
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplate = async () => {
    const result = await downloadPlanPerfTemplate();
    if (result.ok) triggerDownload(result.bytes, result.filename);
    else toast({ title: "템플릿 다운로드 실패", description: result.error });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "파일이 너무 큽니다",
        description: `${(file.size / 1024 / 1024).toFixed(1)}MB (최대 10MB)`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadPlanPerfExcel({ base64, mimeType: file.type || undefined });
      if (result.ok) {
        toast({
          title: "업로드 완료",
          description: `${result.upserted}건 처리. ${result.errors.length > 0 ? `검증 오류 ${result.errors.length}건` : "오류 없음"}.`,
        });
        if (result.errors.length > 0) console.warn("Excel 검증 오류:", result.errors);
        reload(currentPage, urlFilters);
      } else {
        toast({ title: "업로드 실패", description: result.error });
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch}>
        <GridFilterField label={t("filters.q")} className="w-[220px]">
          <Input className="h-8" value={pendingFilters.q} onChange={(e) => setPending("q", e.target.value)} placeholder={t("filters.qPlaceholder")} />
        </GridFilterField>
        <GridFilterField label={t("filters.ym")} className="w-[100px]">
          <Input className="h-8" value={pendingFilters.ym} onChange={(e) => setPending("ym", e.target.value)} placeholder="202604" />
        </GridFilterField>
        <GridFilterField label={t("filters.orgCd")} className="w-[120px]">
          <Input className="h-8" value={pendingFilters.orgCd} onChange={(e) => setPending("orgCd", e.target.value)} placeholder="SALES01" />
        </GridFilterField>
        <GridFilterField label={t("filters.gubunCd")} className="w-[140px]">
          <select className="h-8 w-full rounded border border-slate-200 px-2 text-sm" value={pendingFilters.gubunCd} onChange={(e) => setPending("gubunCd", e.target.value)}>
            <option value="">{t("filters.all")}</option>
            <option value="PLAN">PLAN</option>
            <option value="ACTUAL">ACTUAL</option>
            <option value="FORECAST">FORECAST</option>
          </select>
        </GridFilterField>
        <GridFilterField label={t("filters.trendGbCd")} className="w-[160px]">
          <select className="h-8 w-full rounded border border-slate-200 px-2 text-sm" value={pendingFilters.trendGbCd} onChange={(e) => setPending("trendGbCd", e.target.value)}>
            <option value="">{t("filters.all")}</option>
            <option value="SALES">SALES</option>
            <option value="GROSS_PROFIT">GROSS_PROFIT</option>
            <option value="OP_INCOME">OP_INCOME</option>
          </select>
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleTemplate}>{t("templateBtn")}</Button>
        <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isUploading}>
          {isUploading ? t("uploading") : t("uploadBtn")}
        </Button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
        <span className="text-xs text-slate-500" data-testid="plan-perf-upload-help">{t("uploadHelp")}</span>
      </div>

      <DataGrid<SalesPlanPerfRow>
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
            ...rows.filter((r) => !changes.deletes.includes(r.id)).map((r) => {
              const u = changes.updates.find((u) => u.id === r.id);
              return u ? { ...r, ...u.patch } : r;
            }),
          ];
          const dupes = findDuplicateKeys(allRows, ["ym", "orgCd", "gubunCd", "trendGbCd"]);
          if (dupes.length > 0) {
            return { ok: false, errors: dupes.map((k) => ({ message: t("errors.duplicate", { keys: k }) })) };
          }
          const result = await savePlanPerfUpload(changes);
          if (result.ok) reload(currentPage, urlFilters);
          return { ok: result.ok, ...(result.ok ? {} : { errors: [{ message: result.error }] }) };
        }}
      />
    </div>
  );
}
