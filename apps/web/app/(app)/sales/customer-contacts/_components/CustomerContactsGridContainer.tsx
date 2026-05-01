"use client";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import { exportCustomerContactsToExcel } from "../export";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";

type FilterState = {
  // custName doubles as the "담당자명" search (legacy chargerNm alias removed — Approach A).
  custName: string;
  hpNo: string;
  email: string;
  searchYmdFrom: string;
  searchYmdTo: string;
  page: string;
};

type Props = {
  rows: CustomerContactRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): CustomerContactRow {
  // Legacy ibSheet bizActCustomerMgr.jsp:207~220 marks `custMcd` Hidden:1 (PK, system-assigned).
  // Until a code-generation popup is wired up, derive a placeholder from the row id so the
  // NOT NULL + (workspace, custMcd) UNIQUE constraint is satisfied. createdAt is omitted on
  // new rows — DB defaultNow assigns on save; UI shows "—".
  const id = crypto.randomUUID();
  return {
    id,
    custMcd: id.slice(0, 12),
    customerId: null,
    custName: null,
    jikweeNm: null,
    orgNm: null,
    telNo: null,
    hpNo: null,
    email: null,
    statusYn: true,
    sabun: null,
    custNm: null,
    createdAt: null,
  };
}

// Hidden:0 (visible) columns per legacy ibSheet bizActCustomerMgr.jsp:207~220.
// custMcd / statusYn / sabun are Hidden:1 — intentionally omitted from grid columns.
const COLUMNS: ColumnDef<CustomerContactRow>[] = [
  {
    key: "custNm",
    label: "고객사명",
    type: "readonly",
    width: 180,
    render: (row) => row.custNm ?? "—",
  },
  { key: "custName", label: "담당자명", type: "text", width: 130, editable: true },
  { key: "jikweeNm", label: "직위", type: "text", width: 120, editable: true },
  { key: "orgNm", label: "소속", type: "text", width: 150, editable: true },
  { key: "telNo", label: "전화", type: "text", width: 130, editable: true },
  { key: "hpNo", label: "휴대폰", type: "text", width: 130, editable: true },
  { key: "email", label: "이메일", type: "text", width: 200, editable: true },
  {
    key: "createdAt",
    label: "등록일자",
    type: "readonly",
    width: 110,
    render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
  },
];

// Only custName passed to DataGrid's built-in ColumnFilterRow;
// hpNo/email/date-range are in the DataGridToolbar search form.
// The "담당자명" toolbar input also writes to custName (chargerNm alias removed — Approach A).
const FILTERS: FilterDef<CustomerContactRow>[] = [
  { key: "custName", type: "text", placeholder: "담당자명" },
];

export function CustomerContactsGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const t = useTranslations("Sales.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listCustomerContacts({
          custName: nextFilters.custName || undefined,
          hpNo: nextFilters.hpNo || undefined,
          email: nextFilters.email || undefined,
          searchYmdFrom: nextFilters.searchYmdFrom || undefined,
          searchYmdTo: nextFilters.searchYmdTo || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerContactRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportCustomerContactsToExcel({
        custName: urlFilters.custName || undefined,
        hpNo: urlFilters.hpNo || undefined,
        email: urlFilters.email || undefined,
        searchYmdFrom: urlFilters.searchYmdFrom || undefined,
        searchYmdTo: urlFilters.searchYmdTo || undefined,
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

  return (
    <div className="space-y-2">
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={t("Excel.button")}
        isExporting={isExporting}
      >
        {/* Search form — new filter fields added per Task 6 / P2-A */}
        <div className="flex flex-wrap items-center gap-2">
          {/* "담당자명" input — writes to custName URL key (chargerNm alias removed, Approach A). */}
          <input
            type="text"
            placeholder={t("Search.chargerNm")}
            value={urlFilters.custName}
            onChange={(e) => {
              setUrlFilter("custName", e.target.value);
              if (!e.target.value) reload(1, { ...urlFilters, custName: "", page: "1" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setUrlFilter("page", "1");
                reload(1, { ...urlFilters, page: "1" });
              }
            }}
            className="h-8 w-36 rounded border border-slate-300 px-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("Search.hpNo")}
            value={urlFilters.hpNo}
            onChange={(e) => {
              setUrlFilter("hpNo", e.target.value);
              if (!e.target.value) reload(1, { ...urlFilters, hpNo: "", page: "1" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setUrlFilter("page", "1");
                reload(1, { ...urlFilters, page: "1" });
              }
            }}
            className="h-8 w-36 rounded border border-slate-300 px-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("Search.email")}
            value={urlFilters.email}
            onChange={(e) => {
              setUrlFilter("email", e.target.value);
              if (!e.target.value) reload(1, { ...urlFilters, email: "", page: "1" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setUrlFilter("page", "1");
                reload(1, { ...urlFilters, page: "1" });
              }
            }}
            className="h-8 w-44 rounded border border-slate-300 px-2 text-sm"
          />
          <label className="flex items-center gap-1 text-sm text-slate-600">
            {t("Search.searchYmdFrom")}
            <input
              type="date"
              value={urlFilters.searchYmdFrom}
              onChange={(e) => {
                setUrlFilter("searchYmdFrom", e.target.value);
                setUrlFilter("page", "1");
                reload(1, { ...urlFilters, searchYmdFrom: e.target.value, page: "1" });
              }}
              className="h-8 rounded border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            {t("Search.searchYmdTo")}
            <input
              type="date"
              value={urlFilters.searchYmdTo}
              onChange={(e) => {
                setUrlFilter("searchYmdTo", e.target.value);
                setUrlFilter("page", "1");
                reload(1, { ...urlFilters, searchYmdTo: e.target.value, page: "1" });
              }}
              className="h-8 rounded border border-slate-300 px-2 text-sm"
            />
          </label>
        </div>
      </DataGridToolbar>

      <DataGrid<CustomerContactRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={FILTERS}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{ custName: urlFilters.custName }}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={(f) => {
          const next = { ...urlFilters, custName: f.custName ?? "", page: "1" };
          setUrlFilter("custName", f.custName ?? "");
          setUrlFilter("page", "1");
          reload(1, next);
        }}
        onSave={async (changes) => {
          // Composite-key validation: (workspaceId + custMcd) is UNIQUE in DB.
          // UI dedup guard on custMcd before sending to server.
          const allRows = [
            ...changes.creates,
            ...rows
              .filter((r) => !changes.deletes.includes(r.id))
              .map((r) => {
                const upd = changes.updates.find((u) => u.id === r.id);
                return upd ? { ...r, ...upd.patch } : r;
              }),
          ];
          const dupes = findDuplicateKeys(allRows, ["custMcd"]);
          if (dupes.length > 0) {
            return {
              ok: false,
              errors: dupes.map((k) => ({
                message: `중복된 고객코드(custMcd)가 있습니다: ${k}`,
              })),
            };
          }
          const result = await saveCustomerContacts(changes);
          if (result.ok) reload(currentPage, urlFilters);
          return result;
        }}
      />
    </div>
  );
}
