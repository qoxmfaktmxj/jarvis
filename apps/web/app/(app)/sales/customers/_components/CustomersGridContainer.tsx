"use client";
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomers, saveCustomers } from "../actions";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";
import { MemoModal } from "./MemoModal";

type Option = { value: string; label: string };

type Props = {
  rows: CustomerRow[];
  total: number;
  page: number;
  limit: number;
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
  codeOptions,
}: Props) {
  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listCustomers({
          custNm: nextFilters.custNm || undefined,
          custKindCd: nextFilters.custKindCd || undefined,
          custDivCd: nextFilters.custDivCd || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  // Hidden:0 (visible) columns per legacy ibSheet bizActCustCompanyMgr.jsp:221~233.
  // custCd / businessNo / businessKind / homepage / addr1 are Hidden:1 — intentionally omitted.
  const COLUMNS: ColumnDef<CustomerRow>[] = [
    { key: "custNm", label: "고객명", type: "text", editable: true, required: true },
    { key: "custKindCd", label: "고객종류", type: "select", width: 120, editable: true, options: codeOptions.custKind },
    { key: "custDivCd", label: "고객구분", type: "select", width: 120, editable: true, options: codeOptions.custDiv },
    { key: "ceoNm", label: "대표자", type: "text", width: 150, editable: true },
    { key: "telNo", label: "전화번호", type: "text", width: 130, editable: true },
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
      label: "등록일자",
      type: "readonly",
      width: 110,
      render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
    },
  ];

  const FILTERS: FilterDef<CustomerRow>[] = [
    { key: "custNm", type: "text", placeholder: "고객명" },
    { key: "custKindCd", type: "select", options: codeOptions.custKind },
    { key: "custDivCd", type: "select", options: codeOptions.custDiv },
  ];

  return (
    <>
      <DataGrid<CustomerRow>
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
          const result = await saveCustomers(changes);
          if (result.ok) {
            await reload(page, filterValues);
          }
          return result;
        }}
      />
      <MemoModal
        customerId={memoTarget?.id ?? null}
        customerName={memoTarget?.name}
        onClose={() => setMemoTarget(null)}
        onCountChange={() => reload(page, filterValues)}
      />
    </>
  );
}
