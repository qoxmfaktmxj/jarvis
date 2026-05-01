"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef } from "@/components/grid/types";
import { listCustomers, saveCustomers } from "../actions";
import { exportCustomersToExcel } from "../export";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";
import { MemoModal } from "./MemoModal";

type Option = { value: string; label: string };

type Props = {
  rows: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: {
    custNm?: string;
    custKindCd?: string;
    custDivCd?: string;
    chargerNm?: string;
    searchYmdFrom?: string;
    searchYmdTo?: string;
  };
  codeOptions: {
    custKind: Option[];
    custDiv: Option[];
    exchangeType: Option[];
  };
};

function CountChips({
  counts,
  onMemoClick,
}: {
  counts: { customer: number; op: number; act: number; comt: number };
  onMemoClick: () => void;
}) {
  return (
    <div className="flex gap-1 text-[11px]">
      <span className="rounded bg-slate-100 px-2 py-0.5">고객 {counts.customer}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">기회 {counts.op}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">활동 {counts.act}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMemoClick();
        }}
        className="rounded bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200"
      >
        의견 {counts.comt}
      </button>
    </div>
  );
}

function makeBlankRow(): CustomerRow {
  // Legacy ibSheet bizActCustCompanyMgr.jsp:221~233 marks `custCd` Hidden:1 (PK, system-assigned).
  // Until a code-generation popup is wired up, derive a placeholder from the row id so the
  // NOT NULL + (workspace, custCd) UNIQUE constraint is satisfied. createdAt is omitted on
  // new rows — DB defaultNow assigns on save; UI shows "—".
  const id = crypto.randomUUID();
  return {
    id,
    custCd: id.slice(0, 12),
    custNm: "",
    custKindCd: null,
    custDivCd: null,
    exchangeTypeCd: null,
    custSourceCd: null,
    custImprCd: null,
    buyInfoCd: null,
    buyInfoDtCd: null,
    ceoNm: null,
    telNo: null,
    businessNo: null,
    faxNo: null,
    businessKind: null,
    homepage: null,
    addrNo: null,
    addr1: null,
    addr2: null,
    createdAt: null,
  };
}

export function CustomersGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters = {},
  codeOptions,
}: Props) {
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Sales.Common");

  const { values, setValue } = useUrlFilters<{
    page: string;
    custNm: string;
    custKindCd: string;
    custDivCd: string;
    chargerNm: string;
    searchYmdFrom: string;
    searchYmdTo: string;
  }>({
    defaults: {
      page: String(initialPage),
      custNm: initialFilters.custNm ?? "",
      custKindCd: initialFilters.custKindCd ?? "",
      custDivCd: initialFilters.custDivCd ?? "",
      chargerNm: initialFilters.chargerNm ?? "",
      searchYmdFrom: initialFilters.searchYmdFrom ?? "",
      searchYmdTo: initialFilters.searchYmdTo ?? "",
    },
  });

  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [isSearching, startTransition] = useTransition();

  // pendingFilters — staged inputs; committed to URL + reload on [조회]
  const [pendingFilters, setPendingFilters] = useState({
    custNm: initialFilters.custNm ?? "",
    custKindCd: initialFilters.custKindCd ?? "",
    custDivCd: initialFilters.custDivCd ?? "",
    chargerNm: initialFilters.chargerNm ?? "",
    searchYmdFrom: initialFilters.searchYmdFrom ?? "",
    searchYmdTo: initialFilters.searchYmdTo ?? "",
  });
  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  // Derive current filter values from URL state
  const currentPage = Math.max(1, Number(values.page) || 1);

  const reload = useCallback(
    (nextPage: number, nextFilters: Omit<typeof values, "page">) => {
      startTransition(async () => {
        const res = await listCustomers({
          custNm: nextFilters.custNm || undefined,
          custKindCd: nextFilters.custKindCd || undefined,
          custDivCd: nextFilters.custDivCd || undefined,
          chargerNm: nextFilters.chargerNm || undefined,
          searchYmdFrom: nextFilters.searchYmdFrom || undefined,
          searchYmdTo: nextFilters.searchYmdTo || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  // Hidden:0 (visible) columns per legacy ibSheet bizActCustCompanyMgr.jsp:221~233.
  // custCd / businessNo / businessKind / homepage / addr1 are Hidden:1 — intentionally omitted.
  const COLUMNS: ColumnDef<CustomerRow>[] = [
    { key: "custNm", label: t("Customers.columns.custNm"), type: "text", editable: true, required: true },
    { key: "custKindCd", label: t("Customers.columns.custKindCd"), type: "select", width: 120, editable: true, options: codeOptions.custKind },
    { key: "custDivCd", label: t("Customers.columns.custDivCd"), type: "select", width: 120, editable: true, options: codeOptions.custDiv },
    { key: "ceoNm", label: t("Customers.columns.ceoNm"), type: "text", width: 150, editable: true },
    { key: "telNo", label: t("Customers.columns.telNo"), type: "text", width: 130, editable: true },
    {
      key: "counts",
      label: "탭",
      type: "readonly",
      width: 220,
      render: (row) =>
        row.counts ? (
          <CountChips
            counts={row.counts}
            onMemoClick={() => setMemoTarget({ id: row.id, name: row.custNm })}
          />
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "createdAt",
      label: t("Customers.columns.insdate"),
      type: "readonly",
      width: 110,
      render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
    },
  ];

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const r = await exportCustomersToExcel({
        custNm: values.custNm || undefined,
        custKindCd: values.custKindCd || undefined,
        custDivCd: values.custDivCd || undefined,
        chargerNm: values.chargerNm || undefined,
        searchYmdFrom: values.searchYmdFrom || undefined,
        searchYmdTo: values.searchYmdTo || undefined,
      });
      if (r.ok) {
        triggerDownload(r.bytes, r.filename);
      } else {
        alert(r.error);
      }
    } finally {
      setIsExporting(false);
    }
  }, [values]);

  const handleSearch = useCallback(() => {
    setValue("custNm", pendingFilters.custNm);
    setValue("custKindCd", pendingFilters.custKindCd);
    setValue("custDivCd", pendingFilters.custDivCd);
    setValue("chargerNm", pendingFilters.chargerNm);
    setValue("searchYmdFrom", pendingFilters.searchYmdFrom);
    setValue("searchYmdTo", pendingFilters.searchYmdTo);
    setValue("page", "1");
    reload(1, pendingFilters);
  }, [pendingFilters, setValue, reload]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label={t("Customers.columns.custKindCd")} className="w-[140px]">
          <select
            value={pendingFilters.custKindCd}
            onChange={(e) => setPending("custKindCd", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {codeOptions.custKind.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("Customers.columns.custDivCd")} className="w-[140px]">
          <select
            value={pendingFilters.custDivCd}
            onChange={(e) => setPending("custDivCd", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {codeOptions.custDiv.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("Customers.columns.custNm")} className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.custNm}
            onChange={(e) => setPending("custNm", e.target.value)}
            placeholder={t("Customers.columns.custNm")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={tCommon("Search.chargerNm")} className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.chargerNm}
            onChange={(e) => setPending("chargerNm", e.target.value)}
            placeholder={tCommon("Search.chargerNm")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={tCommon("Search.searchYmdFrom")} className="w-[160px]">
          <input
            type="date"
            value={pendingFilters.searchYmdFrom}
            onChange={(e) => setPending("searchYmdFrom", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
        <GridFilterField label={tCommon("Search.searchYmdTo")} className="w-[160px]">
          <input
            type="date"
            value={pendingFilters.searchYmdTo}
            onChange={(e) => setPending("searchYmdTo", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<CustomerRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => {
          setValue("page", String(p));
          reload(p, values);
        }}
        onFilterChange={() => {
          // Filters are handled by GridSearchForm above
        }}
        onSave={async (changes) => {
          // Composite-key duplicate check: custCd is the UI dedup key
          const allRows = [
            ...changes.creates,
            ...rows.filter((r) => !changes.deletes.includes(r.id)).map((r) => {
              const patch = changes.updates.find((u) => u.id === r.id)?.patch;
              return patch ? { ...r, ...patch } : r;
            }),
          ];
          const dups = findDuplicateKeys(allRows, ["custCd"]);
          if (dups.length > 0) {
            return {
              ok: false,
              errors: [{ message: t("Customers.errors.duplicateCustCd", { codes: dups.join(", ") }) }],
            };
          }

          const result = await saveCustomers(changes);
          if (result.ok) {
            reload(currentPage, values);
          }
          return result;
        }}
      />
      <MemoModal
        customerId={memoTarget?.id ?? null}
        customerName={memoTarget?.name}
        onClose={() => setMemoTarget(null)}
        onCountChange={() => reload(currentPage, values)}
      />
    </div>
  );
}
