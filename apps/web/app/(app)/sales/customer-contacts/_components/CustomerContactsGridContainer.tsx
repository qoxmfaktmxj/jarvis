"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type { ColumnDef } from "@/components/grid/types";
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import { exportCustomerContactsToExcel } from "../export";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";
import { MemoModal } from "./MemoModal";

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

function CountChips({
  counts,
  onMemoClick,
}: {
  counts: { custCompany: number; op: number; act: number; comt: number };
  onMemoClick: () => void;
}) {
  return (
    <div className="flex gap-1 text-[11px]">
      <span className="rounded bg-slate-100 px-2 py-0.5">고객사 {counts.custCompany}</span>
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

export function CustomerContactsGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Sales.Common");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useState<FilterState>({
    custName: initialFilters.custName,
    hpNo: initialFilters.hpNo,
    email: initialFilters.email,
    searchYmdFrom: initialFilters.searchYmdFrom,
    searchYmdTo: initialFilters.searchYmdTo,
    page: initialFilters.page,
  });
  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

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
      key: "counts",
      label: "탭",
      type: "readonly",
      width: 220,
      render: (row) =>
        row.counts ? (
          <CountChips
            counts={row.counts}
            onMemoClick={() => setMemoTarget({ id: row.id, name: row.custName ?? "" })}
          />
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "createdAt",
      label: "등록일자",
      type: "readonly",
      width: 110,
      render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
    },
  ];

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

  const handleSearch = useCallback(() => {
    setUrlFilter("custName", pendingFilters.custName);
    setUrlFilter("hpNo", pendingFilters.hpNo);
    setUrlFilter("email", pendingFilters.email);
    setUrlFilter("searchYmdFrom", pendingFilters.searchYmdFrom);
    setUrlFilter("searchYmdTo", pendingFilters.searchYmdTo);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, setUrlFilter, reload]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label={t("Search.chargerNm")} className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.custName}
            onChange={(e) => setPending("custName", e.target.value)}
            placeholder={t("Search.chargerNm")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("Search.hpNo")} className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.hpNo}
            onChange={(e) => setPending("hpNo", e.target.value)}
            placeholder={t("Search.hpNo")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("Search.email")} className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.email}
            onChange={(e) => setPending("email", e.target.value)}
            placeholder={t("Search.email")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("Search.searchYmdFrom")} className="w-[160px]">
          <DatePicker
            value={pendingFilters.searchYmdFrom || null}
            onChange={(v) => setPending("searchYmdFrom", v ?? "")}
            ariaLabel={t("Search.searchYmdFrom")}
          />
        </GridFilterField>
        <GridFilterField label={t("Search.searchYmdTo")} className="w-[160px]">
          <DatePicker
            value={pendingFilters.searchYmdTo || null}
            onChange={(v) => setPending("searchYmdTo", v ?? "")}
            ariaLabel={t("Search.searchYmdTo")}
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<CustomerContactRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onRowDoubleClick={(row) => router.push("/sales/customer-contacts/" + row.id + "/edit")}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={() => {
          // Filters managed by GridSearchForm above
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
      <MemoModal
        contactId={memoTarget?.id ?? null}
        contactName={memoTarget?.name}
        onClose={() => setMemoTarget(null)}
        onCountChange={() => reload(currentPage, urlFilters)}
      />
    </div>
  );
}
