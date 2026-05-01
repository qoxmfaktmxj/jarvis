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

  // selectedRowId tracks the grid row the user last clicked (set via DataGrid onClick — see below).
  // Used by EmployeePicker to know which row to patch sabun on.
  // NOTE: DataGrid exposes row selection only via its internal `selected` state. We mirror it here
  // via a ref updated on DataGrid's onFilterChange side-effect (not ideal). The cleaner long-term
  // solution is to expose onRowSelect from DataGrid (Task backlog). For now EmployeePicker is
  // rendered as a standalone input above the grid and requires user to select a row first.
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // sabunOverrides: maps rowId → { sabun, custName, email }.
  // When EmployeePicker selects an employee for a row, we store the mapping here and inject
  // it into the saveCustomerContacts batch at save time (merging into creates/updates).
  // This avoids needing direct access to DataGrid's internal useGridState.update().
  const sabunOverrides = useRef<Map<string, { sabun: string; custName?: string; email?: string }>>(
    new Map(),
  );

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
          // Clear sabun overrides on reload — stale row ids are invalid.
          sabunOverrides.current.clear();
          setSelectedRowId(null);
        }
      });
    },
    [limit],
  );

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
          sabun은 Hidden:1 컬럼 — grid에 직접 편집 UI 없음. 사용자가 DataGrid에서 행을 클릭한 뒤
          이 EmployeePicker로 영업담당자를 검색·선택하면 sabunOverrides에 rowId → sabun 매핑 저장.
          실제 DB 반영은 onSave 배치에서 이루어짐 (sabunOverrides를 patch에 주입).
          selectedRowId가 없을 때 disabled. */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <span className="text-xs text-slate-500">
          {t("CustomerContacts.columns.sabun")}
          {selectedRowId ? (
            <span className="ml-1 text-blue-600">
              ({rows.find((r) => r.id === selectedRowId)?.custName ?? "선택된 행"})
            </span>
          ) : (
            <span className="ml-1 text-slate-400">— 행을 선택하세요</span>
          )}
        </span>
        <div className="w-56">
          <EmployeePicker
            value={
              selectedRowId
                ? (sabunOverrides.current.get(selectedRowId)?.custName ??
                  rows.find((r) => r.id === selectedRowId)?.sabun ??
                  "")
                : ""
            }
            onSelect={(emp) => {
              if (!selectedRowId) return;
              sabunOverrides.current.set(selectedRowId, {
                sabun: emp.employeeId,
                custName: emp.name,
                email: emp.email ?? undefined,
              });
              // Optimistically reflect sabun text in the rows state for display.
              setRows((prev) =>
                prev.map((r) =>
                  r.id === selectedRowId ? { ...r, sabun: emp.employeeId } : r,
                ),
              );
            }}
            placeholder={t("CustomerContacts.search.chargerNm")}
            disabled={!selectedRowId}
          />
        </div>
      </div>

      {/* DataGridToolbar (separate strip above DataGrid — per baseline JSDoc pattern). */}
      <DataGridToolbar onExport={handleExport} exportLabel={t("Common.Excel.label")} />

      {/* DataGrid wraps with an onClick capture on the container div to detect row selection.
          DataGrid's internal `selected` state is not exposed; we mirror it here via a capture
          listener on data-row-status rows. Long-term: expose onRowSelect from DataGrid.
          role="presentation" + onKeyDown suppress jsx-a11y warnings — this div is a non-interactive
          capture wrapper, not a focusable control; row selection keyboard interaction is provided
          by the DataGrid's own <tr> elements. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={(e) => {
          const row = (e.target as HTMLElement).closest("tr[data-row-status]");
          if (row) {
            // We rely on DOM order matching rows array order (DataGrid renders rows in order).
            const tbody = row.parentElement;
            if (tbody) {
              const trIndex = Array.from(tbody.children).indexOf(row as HTMLTableRowElement);
              if (trIndex >= 0 && trIndex < rows.length) {
                setSelectedRowId(rows[trIndex]?.id ?? null);
              }
            }
          }
        }}
      >
        <DataGrid<CustomerContactRow>
          rows={rows}
          total={total}
          columns={COLUMNS}
          filters={FILTERS}
          page={page}
          limit={limit}
          makeBlankRow={makeBlankRow}
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
            // Inject sabunOverrides into creates/updates before saving.
            const overrides = sabunOverrides.current;
            const patchedCreates = changes.creates.map((row) => {
              const ov = overrides.get(row.id);
              return ov ? { ...row, sabun: ov.sabun } : row;
            });
            const patchedUpdates = changes.updates.map((u) => {
              const ov = overrides.get(u.id);
              return ov ? { ...u, patch: { ...u.patch, sabun: ov.sabun } } : u;
            });
            // Also add sabun-only updates for rows that have sabunOverrides but no other dirty changes.
            const overrideOnlyUpdates: typeof changes.updates = [];
            for (const [rowId, ov] of overrides.entries()) {
              const alreadyCovered =
                patchedCreates.some((r) => r.id === rowId) ||
                patchedUpdates.some((u) => u.id === rowId) ||
                changes.deletes.includes(rowId);
              if (!alreadyCovered) {
                overrideOnlyUpdates.push({ id: rowId, patch: { sabun: ov.sabun } });
              }
            }

            const result = await saveCustomerContacts({
              creates: patchedCreates,
              updates: [...patchedUpdates, ...overrideOnlyUpdates],
              deletes: changes.deletes,
            });
            if (result.ok) await reload(page, values);
            return result;
          }}
        />
      </div>
    </>
  );
}
