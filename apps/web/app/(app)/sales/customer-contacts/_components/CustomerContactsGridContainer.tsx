"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";
import { MemoModal } from "./MemoModal";

type Props = {
  rows: CustomerContactRow[];
  total: number;
  page: number;
  limit: number;
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

const FILTERS: FilterDef<CustomerContactRow>[] = [
  { key: "custName", type: "text", placeholder: "담당자명" },
];

export function CustomerContactsGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCustomerContacts({
          custName: nextFilters.custName || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerContactRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
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

  return (
    <>
      <DataGrid<CustomerContactRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => {
          const result = await saveCustomerContacts(changes);
          if (result.ok) await reload(page, filterValues);
          return result;
        }}
      />
      <MemoModal
        contactId={memoTarget?.id ?? null}
        contactName={memoTarget?.name}
        onClose={() => setMemoTarget(null)}
        onCountChange={() => reload(page, filterValues)}
      />
    </>
  );
}
