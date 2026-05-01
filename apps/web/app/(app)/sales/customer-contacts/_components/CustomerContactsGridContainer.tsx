"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

  // I-A: local state for chargerNm/hpNo/email inputs avoids cursor-jump race between
  // the URL-derived value and the live input. Debounced (300ms) effect commits to
  // URL + reload — mirrors Task 4 (14d6229) pattern verbatim, extended to 3 inputs.
  const [chargerNmInput, setChargerNmInput] = useState(values.chargerNm);
  const [hpNoInput, setHpNoInput] = useState(values.hpNo);
  const [emailInput, setEmailInput] = useState(values.email);

  // Reverse sync: URL → local (e.g. browser back/forward navigation).
  useEffect(() => { setChargerNmInput(values.chargerNm); }, [values.chargerNm]);
  useEffect(() => { setHpNoInput(values.hpNo); }, [values.hpNo]);
  useEffect(() => { setEmailInput(values.email); }, [values.email]);

  // Local → debounce → URL + reload. values/reload intentionally excluded from
  // deps to prevent infinite restart; each input change is the sole trigger.
  useEffect(() => {
    if (chargerNmInput === values.chargerNm) return;
    const t = setTimeout(() => {
      setValue("chargerNm", chargerNmInput);
      reload(1, { ...values, chargerNm: chargerNmInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargerNmInput]);

  useEffect(() => {
    if (hpNoInput === values.hpNo) return;
    const t = setTimeout(() => {
      setValue("hpNo", hpNoInput);
      reload(1, { ...values, hpNo: hpNoInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpNoInput]);

  useEffect(() => {
    if (emailInput === values.email) return;
    const t = setTimeout(() => {
      setValue("email", emailInput);
      reload(1, { ...values, email: emailInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailInput]);

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
      {/* I-A: 3 filter inputs + EmployeePicker unified into DataGridToolbar children.
          Per DataGridToolbar JSDoc: pass extra controls via children for a unified strip.
          Replaces the old 2 separate strip divs + DataGridToolbar (4 strips → 1).
          custName remains in DataGrid's ColumnFilterRow (FILTERS above).
          sabun is Hidden:1 — EmployeePicker triggers insert with pre-filled row. */}
      <DataGridToolbar onExport={handleExport} exportLabel={t("Common.Excel.label")}>
        <input
          type="text"
          placeholder={t("CustomerContacts.search.chargerNm")}
          value={chargerNmInput}
          onChange={(e) => setChargerNmInput(e.target.value)}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <input
          type="text"
          placeholder={t("CustomerContacts.search.hpNo")}
          value={hpNoInput}
          onChange={(e) => setHpNoInput(e.target.value)}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <input
          type="text"
          placeholder={t("CustomerContacts.search.email")}
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="w-40 rounded border border-slate-200 px-2 py-1 text-xs"
        />
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
      </DataGridToolbar>

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
