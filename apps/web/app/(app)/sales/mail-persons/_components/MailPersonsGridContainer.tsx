"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { sanitizeCellValue } from "@/lib/utils/sanitize-csv";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import type { EmployeeMatch } from "@/lib/queries/employee-search";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listMailPersons, saveMailPersons } from "../actions";
import type { MailPersonRow } from "@jarvis/shared/validation/sales/mail-person";

type Props = { rows: MailPersonRow[]; total: number; page: number; limit: number };

type PendingEmployee = { employeeId: string; name: string; email: string };

// Hidden:0 (visible) columns per legacy ibSheet bizMailPersonMgr.jsp:26~35.
// `sabun` is Hidden:1 (PK) — intentionally omitted from grid display columns.
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

function makeBlankRow(): MailPersonRow {
  // Legacy ibSheet bizMailPersonMgr.jsp:26~35 marks `sabun` Hidden:1 (PK, not user-input here).
  // Derive a placeholder sabun from the row id so the NOT NULL + (workspace, sabun) UNIQUE
  // constraint is satisfied until EmployeePicker is used (which sets the real sabun).
  // createdAt is omitted on new rows — DB defaultNow assigns on save; UI shows "—".
  const id = crypto.randomUUID();
  return {
    id,
    sabun: id.slice(0, 12),
    name: "",
    mailId: "",
    salesYn: false,
    insaYn: false,
    memo: null,
    createdAt: null,
  };
}

export function MailPersonsGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const tCommon = useTranslations();
  const [rows, setRows] = useState<MailPersonRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  // PR #42 commit 2c9506f pattern: pendingEmployee ref triggers makeBlankRowWithEmployee
  // when DataGrid's insert button is programmatically clicked.
  const pendingEmployee = useRef<PendingEmployee | null>(null);
  const dataGridWrapperRef = useRef<HTMLDivElement>(null);

  const reload = useCallback((nextPage: number, nextFilters: Record<string, string>) => {
    startTransition(async () => {
      const res = await listMailPersons({ name: nextFilters.name || undefined, page: nextPage, limit });
      if (!("error" in res)) { setRows(res.rows as MailPersonRow[]); setTotal(res.total); setPage(nextPage); setFilterValues(nextFilters); }
    });
  }, [limit]);

  const makeBlankRowWithEmployee = useCallback((): MailPersonRow => {
    const emp = pendingEmployee.current;
    pendingEmployee.current = null;
    if (emp) {
      // emp.employeeId → row.sabun (schema PK field)
      // emp.email → row.mailId (schema column is mailId, not email — mapping at consumer boundary)
      return {
        id: crypto.randomUUID(),
        sabun: emp.employeeId,
        name: emp.name,
        mailId: emp.email,
        salesYn: false,
        insaYn: false,
        memo: null,
        createdAt: null,
      };
    }
    return makeBlankRow();
  }, []);

  const handleEmployeeSelect = useCallback((emp: EmployeeMatch) => {
    pendingEmployee.current = emp;
    // Programmatically click DataGrid's first non-disabled button (the "입력" insert button)
    const firstBtn = dataGridWrapperRef.current?.querySelector<HTMLButtonElement>(
      "button:not([disabled])",
    );
    firstBtn?.click();
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: typeof c.label === "string" ? c.label : c.key,
      }));
      // sabun (Hidden:1 PK) included for audit completeness — lets reviewer verify employee ID
      if (!exportColumns.find((c) => c.key === "sabun")) {
        exportColumns.unshift({ key: "sabun", header: "사번" });
      }
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await exportToExcel({
        filename: `mail-persons_${date}`,
        sheetName: "메일담당자",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => sanitizeCellValue(
          (row as Record<string, unknown>)[col.key]
        ),
      });
    } finally {
      setIsExporting(false);
    }
  }, [rows]);

  return (
    <div ref={dataGridWrapperRef}>
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={tCommon("Sales.Common.Excel.label")}
        isExporting={isExporting}
      >
        <EmployeePicker
          value=""
          onSelect={handleEmployeeSelect}
          placeholder={tCommon("Sales.MailPersons.search.employeeAddPlaceholder")}
        />
      </DataGridToolbar>
      <DataGrid<MailPersonRow>
        syncWithUrl
        rows={rows} total={total} columns={COLUMNS} filters={FILTERS}
        page={page} limit={limit} makeBlankRow={makeBlankRowWithEmployee} filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => { const result = await saveMailPersons(changes); if (result.ok) await reload(page, filterValues); return result; }}
      />
    </div>
  );
}
