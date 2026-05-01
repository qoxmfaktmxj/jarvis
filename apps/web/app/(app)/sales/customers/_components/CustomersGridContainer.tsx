"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
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
  const router = useRouter();
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
  const [, startTransition] = useTransition();

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

  // Search form section — rendered inside DataGridToolbar children
  const searchForm = (
    <div className="flex flex-wrap items-center gap-2">
      {/* custNm */}
      <input
        type="text"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder={t("Customers.columns.custNm")}
        value={values.custNm}
        onChange={(e) => setValue("custNm", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setValue("page", "1");
            reload(1, { ...values, custNm: values.custNm });
          }
        }}
      />
      {/* custKindCd */}
      <select
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        value={values.custKindCd}
        onChange={(e) => {
          const v = e.target.value;
          setValue("custKindCd", v);
          setValue("page", "1");
          reload(1, { ...values, custKindCd: v });
        }}
      >
        <option value="">{t("Customers.columns.custKindCd")}</option>
        {codeOptions.custKind.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {/* custDivCd */}
      <select
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        value={values.custDivCd}
        onChange={(e) => {
          const v = e.target.value;
          setValue("custDivCd", v);
          setValue("page", "1");
          reload(1, { ...values, custDivCd: v });
        }}
      >
        <option value="">{t("Customers.columns.custDivCd")}</option>
        {codeOptions.custDiv.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {/* chargerNm */}
      <input
        type="text"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder={tCommon("Search.chargerNm")}
        value={values.chargerNm}
        onChange={(e) => setValue("chargerNm", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setValue("page", "1");
            reload(1, { ...values, chargerNm: values.chargerNm });
          }
        }}
      />
      {/* searchYmdFrom ~ searchYmdTo */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500">{tCommon("Search.searchYmd")}</span>
        <input
          type="date"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder={tCommon("Search.searchYmdFrom")}
          value={values.searchYmdFrom}
          onChange={(e) => {
            const v = e.target.value;
            setValue("searchYmdFrom", v);
            setValue("page", "1");
            reload(1, { ...values, searchYmdFrom: v });
          }}
        />
        <span className="text-xs text-slate-400">~</span>
        <input
          type="date"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder={tCommon("Search.searchYmdTo")}
          value={values.searchYmdTo}
          onChange={(e) => {
            const v = e.target.value;
            setValue("searchYmdTo", v);
            setValue("page", "1");
            reload(1, { ...values, searchYmdTo: v });
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-0">
      <DataGridToolbar
        exportLabel={isExporting ? tCommon("Excel.downloading") : tCommon("Excel.button")}
        isExporting={isExporting}
        onExport={async () => {
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
        }}
      >
        {searchForm}
      </DataGridToolbar>
      <DataGrid<CustomerRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/customers/" + row.id + "/edit")}
        onPageChange={(p) => {
          setValue("page", String(p));
          reload(p, values);
        }}
        onFilterChange={() => {
          // Filters are handled by the toolbar search form above
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
