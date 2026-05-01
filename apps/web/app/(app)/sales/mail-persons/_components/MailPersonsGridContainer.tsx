"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv-export";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listMailPersons, saveMailPersons } from "../actions";
import type { MailPersonRow } from "@jarvis/shared/validation/sales/mail-person";

type FilterDefaults = {
  name: string;
};

type Props = {
  rows: MailPersonRow[];
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

// Hidden:0 (visible) columns per legacy ibSheet bizMailPersonMgr.jsp:26~35.
// `sabun` is Hidden:1 (PK) — intentionally omitted from grid columns.
const COLUMNS: ColumnDef<MailPersonRow>[] = [
  { key: "name", label: "이름", type: "text", width: 140, editable: true, required: true },
  { key: "mailId", label: "메일 ID", type: "text", width: 220, editable: true, required: true },
  { key: "salesYn", label: "영업", type: "boolean", width: 70, editable: true },
  { key: "insaYn", label: "인사", type: "boolean", width: 70, editable: true },
  { key: "memo", label: "메모", type: "text", editable: true },
  {
    key: "createdAt",
    label: "등록일자",
    type: "readonly",
    width: 110,
    render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : "—"),
  },
];

const FILTERS: FilterDef<MailPersonRow>[] = [
  { key: "name", type: "text", placeholder: "이름" },
];

export function MailPersonsGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters,
}: Props) {
  const t = useTranslations("Sales");
  const [rows, setRows] = useState<MailPersonRow[]>(initialRows);
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
      name: initialFilters?.name ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { values, setValue } = useUrlFilters<FilterDefaults>({ defaults: FILTER_DEFAULTS });

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterDefaults) => {
      startTransition(async () => {
        const res = await listMailPersons({
          name: nextFilters.name || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as MailPersonRow[]);
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    [limit],
  );

  // Local state for name input avoids cursor-jump race between the URL-derived value and the
  // live input. Debounced (300ms) effect commits to URL + reload — mirrors Task 4 pattern.
  const [nameInput, setNameInput] = useState(values.name);

  // Reverse sync: URL → local (e.g. browser back/forward navigation).
  useEffect(() => {
    setNameInput(values.name);
  }, [values.name]);

  // Local → debounce → URL + reload. values/reload intentionally excluded from
  // deps to prevent infinite restart; each input change is the sole trigger.
  useEffect(() => {
    if (nameInput === values.name) return;
    const timer = setTimeout(() => {
      setValue("name", nameInput);
      reload(1, { ...values, name: nameInput });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameInput]);

  // makeBlankRowWithEmployee: factory passed to DataGrid as makeBlankRow.
  // If pendingEmployee ref is set (EmployeePicker just selected someone), the new row is
  // pre-filled with sabun=employeeId, name=name, mailId=email. Otherwise produces a
  // fully blank row (same as before, for regular "입력" button clicks).
  // Legacy ibSheet bizMailPersonMgr.jsp:26~35 marks `sabun` Hidden:1 (PK, not user-input here).
  // Derive a placeholder sabun from the row id so the NOT NULL + (workspace, sabun) UNIQUE
  // constraint is satisfied when picker is not used. createdAt omitted — DB defaultNow on save.
  const makeBlankRowWithEmployee = useCallback((): MailPersonRow => {
    const id = crypto.randomUUID();
    const emp = pendingEmployee.current;
    // Consume the pending employee so subsequent plain "입력" clicks produce blank rows.
    pendingEmployee.current = null;
    return {
      id,
      // emp.employeeId → row.sabun (Hidden:1 PK in legacy ibSheet)
      sabun: emp?.employeeId ?? id.slice(0, 12),
      name: emp?.name ?? "",
      // emp.email → row.mailId (sales_mail_person schema uses mailId, not email)
      mailId: emp?.email ?? "",
      salesYn: false,
      insaYn: false,
      memo: null,
      createdAt: null,
    };
  }, []);

  // CSV export: Hidden:0 columns only (mirrors COLUMNS above).
  const handleExport = () => {
    const csv = rowsToCsv(rows, [
      { key: "sabun", header: "사번" },
      { key: "name", header: "이름" },
      { key: "mailId", header: "메일ID" },
      { key: "salesYn", header: "영업" },
      { key: "insaYn", header: "인사" },
      { key: "memo", header: "메모" },
      { key: "createdAt", header: "등록일자" },
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `mail-persons_${date}.csv`);
  };

  return (
    <>
      {/* name input + EmployeePicker unified into DataGridToolbar children.
          Per DataGridToolbar JSDoc: pass extra controls via children for a unified strip.
          name filter remains in DataGrid's ColumnFilterRow (FILTERS above) for the column,
          but DataGridToolbar also exposes a debounced name search in the toolbar.
          sabun is Hidden:1 — EmployeePicker triggers insert with pre-filled row. */}
      <DataGridToolbar onExport={handleExport} exportLabel={t("Common.Excel.label")}>
        <input
          type="text"
          placeholder={t("MailPersons.search.name")}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <span className="text-xs text-slate-500">{t("MailPersons.columns.sabun")}</span>
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

      {/* DataGrid: makeBlankRowWithEmployee replaces the static makeBlankRow — it consumes
          pendingEmployee ref when EmployeePicker triggers the insert. */}
      <div ref={dataGridWrapperRef}>
        <DataGrid<MailPersonRow>
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
              name: (f.name as string | undefined) ?? "",
            };
            if (next.name !== values.name) setValue("name", next.name);
            reload(1, next);
          }}
          onSave={async (changes) => {
            const result = await saveMailPersons(changes);
            if (result.ok) await reload(page, values);
            return result;
          }}
        />
      </div>
    </>
  );
}
