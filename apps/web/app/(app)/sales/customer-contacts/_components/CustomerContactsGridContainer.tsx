"use client";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv-export";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";

type FilterDefaults = {
  custName: string;
  chargerNm: string;
  hpNo: string;
  email: string;
};

type Props = {
  rows: CustomerContactRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: Partial<FilterDefaults>;
};

// pendingEmployee stores the employee selected in EmployeePicker before makeBlankRow is called.
// makeBlankRow (passed to DataGrid) consumes and clears it, so the new row is pre-filled with
// the employee's data. This avoids any DOM row-index assumptions.
type PendingEmployee = {
  employeeId: string;
  name: string;
  email?: string | null;
};

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

const FILTERS: FilterDef<CustomerContactRow>[] = [
  { key: "custName", type: "text", placeholder: "담당자명" },
];

export function CustomerContactsGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters,
}: Props) {
  const t = useTranslations("Sales");
  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [, startTransition] = useTransition();

  // pendingEmployee: set by EmployeePicker onSelect, consumed by makeBlankRowWithEmployee.
  // Using a ref (not state) so that makeBlankRow (a stable function reference passed to DataGrid)
  // can read the latest value without causing re-renders or stale closures.
  const pendingEmployee = useRef<PendingEmployee | null>(null);

  // dataGridWrapperRef: used to programmatically click DataGrid's internal "입력" (insert) button
  // when EmployeePicker selects an employee. The insert button is always the first <button> inside
  // the GridToolbar, which is the first button rendered inside the DataGrid div.
  // This is safe (unlike DOM row-index capture) because we're triggering a stable UI action,
  // not reading positional row data.
  const dataGridWrapperRef = useRef<HTMLDivElement>(null);

  // URL-synced filter state (replaces local useState filterValues).
  // useUrlFilters keeps searchParams in sync so page.tsx re-runs on navigation,
  // providing SSR-rendered initial rows (parity with legacy ibSheet searchXxx map).
  // FILTER_DEFAULTS via useMemo for stable ref (Task 4 concern #2).
  const FILTER_DEFAULTS = useMemo(
    (): FilterDefaults => ({
      custName: initialFilters?.custName ?? "",
      chargerNm: initialFilters?.chargerNm ?? "",
      hpNo: initialFilters?.hpNo ?? "",
      email: initialFilters?.email ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { values, setValue } = useUrlFilters<FilterDefaults>({ defaults: FILTER_DEFAULTS });

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterDefaults) => {
      startTransition(async () => {
        const res = await listCustomerContacts({
          custName: nextFilters.custName || undefined,
          chargerNm: nextFilters.chargerNm || undefined,
          hpNo: nextFilters.hpNo || undefined,
          email: nextFilters.email || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as CustomerContactRow[]);
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    [limit],
  );

  // makeBlankRowWithEmployee: factory passed to DataGrid as makeBlankRow.
  // If pendingEmployee ref is set (EmployeePicker just selected someone), the new row is
  // pre-filled with sabun=employeeId, custName=name, email=email. Otherwise produces a
  // fully blank row (same as before, for regular "입력" button clicks).
  // Legacy ibSheet bizActCustomerMgr.jsp:207~220 marks `custMcd` Hidden:1 (PK, system-assigned).
  // Until a code-generation popup is wired up, derive a placeholder from the row id so the
  // NOT NULL + (workspace, custMcd) UNIQUE constraint is satisfied. createdAt is omitted on
  // new rows — DB defaultNow assigns on save; UI shows "—".
  const makeBlankRowWithEmployee = useCallback((): CustomerContactRow => {
    const id = crypto.randomUUID();
    const emp = pendingEmployee.current;
    // Consume the pending employee so subsequent plain "입력" clicks produce blank rows.
    pendingEmployee.current = null;
    return {
      id,
      custMcd: id.slice(0, 12),
      customerId: null,
      custName: emp?.name ?? null,
      jikweeNm: null,
      orgNm: null,
      telNo: null,
      hpNo: null,
      email: emp?.email ?? null,
      statusYn: true,
      sabun: emp?.employeeId ?? null,
      custNm: null,
      createdAt: null,
    };
  }, []);

  // CSV export: Hidden:0 columns only (mirrors COLUMNS above).
  const handleExport = () => {
    const csv = rowsToCsv(rows, [
      { key: "custNm", header: "고객사명" },
      { key: "custName", header: "담당자명" },
      { key: "jikweeNm", header: "직위" },
      { key: "orgNm", header: "소속" },
      { key: "telNo", header: "전화" },
      { key: "hpNo", header: "휴대폰" },
      { key: "email", header: "이메일" },
      { key: "createdAt", header: "등록일자" },
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `customer-contacts_${date}.csv`);
  };

  return (
    <>
      {/* Extra search filter strips — separate from DataGrid's built-in filter bar.
          custName remains in DataGrid's ColumnFilterRow (FILTERS above).
          chargerNm / hpNo / email are rendered here as separate strips
          (separate strips pattern — Task 4 / DataGridToolbar baseline). */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <input
          type="text"
          placeholder={t("CustomerContacts.search.chargerNm")}
          value={values.chargerNm}
          onChange={(e) => {
            setValue("chargerNm", e.target.value);
            reload(1, { ...values, chargerNm: e.target.value });
          }}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <input
          type="text"
          placeholder={t("CustomerContacts.search.hpNo")}
          value={values.hpNo}
          onChange={(e) => {
            setValue("hpNo", e.target.value);
            reload(1, { ...values, hpNo: e.target.value });
          }}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <input
          type="text"
          placeholder={t("CustomerContacts.search.email")}
          value={values.email}
          onChange={(e) => {
            setValue("email", e.target.value);
            reload(1, { ...values, email: e.target.value });
          }}
          className="w-40 rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </div>

      {/* sabun / EmployeePicker strip.
          sabun은 Hidden:1 컬럼 — grid에 직접 편집 UI 없음.
          EmployeePicker는 "신규 contact 등록" 트리거: 직원 선택 시 sabun/name/email이
          미리 채워진 새 row를 grid에 추가한다. 기존 row의 sabun은 건드리지 않음.
          (이전 DOM-based row capture 패턴 제거 — 정렬/필터 시 DOM 순서 불일치 위험) */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <span className="text-xs text-slate-500">{t("CustomerContacts.columns.sabun")}</span>
        <div className="w-56">
          <EmployeePicker
            value=""
            onSelect={(emp) => {
              // Store the selected employee in the ref so makeBlankRowWithEmployee can consume it.
              pendingEmployee.current = {
                employeeId: emp.employeeId,
                name: emp.name,
                email: emp.email,
              };
              // Programmatically click DataGrid's internal "입력" (insert) button.
              // The button is always the first <button> inside the grid wrapper div.
              // This is safe: we trigger a stable UI action, not read positional row data.
              const firstBtn = dataGridWrapperRef.current?.querySelector<HTMLButtonElement>(
                "button:not([disabled])",
              );
              firstBtn?.click();
            }}
            placeholder={t("CustomerContacts.search.employeeAddPlaceholder")}
          />
        </div>
      </div>

      {/* DataGridToolbar (separate strip above DataGrid — per baseline JSDoc pattern). */}
      <DataGridToolbar onExport={handleExport} exportLabel={t("Common.Excel.label")} />

      {/* DataGrid: no onClick wrapper needed. Row selection is DataGrid-internal.
          makeBlankRowWithEmployee replaces the static makeBlankRow — it consumes
          pendingEmployee ref when EmployeePicker triggers the insert. */}
      <div ref={dataGridWrapperRef}>
        <DataGrid<CustomerContactRow>
          rows={rows}
          total={total}
          columns={COLUMNS}
          filters={FILTERS}
          page={page}
          limit={limit}
          makeBlankRow={makeBlankRowWithEmployee}
          filterValues={values}
          onPageChange={(p) => reload(p, values)}
          onFilterChange={(f) => {
            const next: FilterDefaults = {
              custName: (f.custName as string | undefined) ?? "",
              chargerNm: values.chargerNm,
              hpNo: values.hpNo,
              email: values.email,
            };
            if (next.custName !== values.custName) setValue("custName", next.custName);
            reload(1, next);
          }}
          onSave={async (changes) => {
            const result = await saveCustomerContacts(changes);
            if (result.ok) await reload(page, values);
            return result;
          }}
        />
      </div>
    </>
  );
}
