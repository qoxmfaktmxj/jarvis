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
import { listCustomerContacts, saveCustomerContacts } from "../actions";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";

type Props = {
  rows: CustomerContactRow[];
  total: number;
  page: number;
  limit: number;
};

type PendingEmployee = { employeeId: string; name: string; email: string };

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

export function CustomerContactsGridContainer({ rows: initialRows, total: initialTotal, page: initialPage, limit }: Props) {
  const tCommon = useTranslations();
  const [rows, setRows] = useState<CustomerContactRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  // PR #42 commit 9b507b6 pattern: pendingEmployee ref triggers makeBlankRowWithEmployee
  // when DataGrid's insert button is programmatically clicked.
  const pendingEmployee = useRef<PendingEmployee | null>(null);
  const dataGridWrapperRef = useRef<HTMLDivElement>(null);

  // FILTERS with 3 new search fields (custName existing + chargerNm/hpNo/email new)
  const FILTERS: FilterDef<CustomerContactRow>[] = [
    { key: "custName", type: "text", placeholder: tCommon("Sales.CustomerContacts.columns.custName") },
    { key: "chargerNm", type: "text", placeholder: tCommon("Sales.CustomerContacts.search.chargerNm") },
    { key: "hpNo", type: "text", placeholder: tCommon("Sales.CustomerContacts.search.hpNo") },
    { key: "email", type: "text", placeholder: tCommon("Sales.CustomerContacts.search.email") },
  ];

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
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
          setFilterValues(nextFilters);
        }
      });
    },
    [limit],
  );

  const makeBlankRowWithEmployee = useCallback((): CustomerContactRow => {
    const emp = pendingEmployee.current;
    pendingEmployee.current = null;
    if (emp) {
      // emp.employeeId → row.sabun (schema column)
      // emp.name → row.custName (담당자명)
      // emp.email → row.email (schema column)
      return {
        id: crypto.randomUUID(),
        custMcd: crypto.randomUUID().slice(0, 12),
        sabun: emp.employeeId,
        custName: emp.name,
        email: emp.email,
        hpNo: null,
        telNo: null,
        jikweeNm: null,
        orgNm: null,
        customerId: null,
        custNm: null,
        statusYn: true,
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
      // sabun (Hidden:1 PK) included for audit completeness
      if (!exportColumns.find((c) => c.key === "sabun")) {
        exportColumns.unshift({ key: "sabun", header: "담당사번" });
      }
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await exportToExcel({
        filename: `customer-contacts_${date}`,
        sheetName: "고객담당자",
        columns: exportColumns,
        rows,
        cellFormatter: (row, col) => {
          // counts column (angry-ishizaka follow-on) skip guard
          if (col.key === "counts") return "";
          return sanitizeCellValue((row as Record<string, unknown>)[col.key]);
        },
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
          placeholder={tCommon("Sales.CustomerContacts.search.employeeAddPlaceholder")}
        />
      </DataGridToolbar>
      <DataGrid<CustomerContactRow>
        syncWithUrl
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRowWithEmployee}
        filterValues={filterValues}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => {
          const result = await saveCustomerContacts(changes);
          if (result.ok) await reload(page, filterValues);
          return result;
        }}
      />
    </div>
  );
}
