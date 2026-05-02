"use client";
/**
 * MailPersonsGridContainer.tsx
 *
 * ibsheet baseline (DataGridToolbar + useUrlFilters + findDuplicateKeys)
 * + EmployeePicker integration for the `sabun` cell on new rows.
 *
 * EmployeePicker approach:
 *   `sabun` is type:"readonly" with a `render` callback.
 *   When the row is a blank new row (name === "" && mailId === ""), the cell
 *   renders an EmployeePicker combobox. On `onSelect(hit)`, the container
 *   auto-saves the new row with the picked sabun/name/mailId values, then
 *   reloads. This mirrors the legacy ibsheet popup behaviour where the picker
 *   committed the row immediately rather than going through the save button.
 *
 *   For existing (clean/dirty) rows the sabun cell is read-only plain text,
 *   matching legacy Hidden:0 UpdateEdit:0 (display-only after creation).
 *
 *   DataGrid initialises its internal row state lazily via useState — prop
 *   changes to `rows` do not re-sync internal state. After a picker auto-save
 *   we increment `reloadKey` and pass it as `key` to <DataGrid> so the
 *   component remounts cleanly from the fresh server rows. This key-bump is
 *   ONLY triggered by the picker flow, never by the normal Save button, so
 *   regular in-grid edits are unaffected.
 *
 * Composite key dedup: sabun + mailId
 * (enterCd is implicit via workspaceId; name is a display field.)
 */
import { useCallback, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import type { ColumnDef } from "@/components/grid/types";
import { toast } from "@/hooks/use-toast";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { searchEmployees } from "@/lib/server/employees";
import { listMailPersons, saveMailPersons } from "../actions";
import { exportMailPersonsToExcel } from "../export";
import type { MailPersonRow } from "@jarvis/shared/validation/sales/mail-person";

type Props = {
  rows: MailPersonRow[];
  total: number;
  page: number;
  limit: number;
  initialFilters?: {
    searchMail: string;
    name: string;
    sabun: string;
  };
};

type FilterValues = {
  searchMail: string;
  name: string;
  sabun: string;
  page: string;
};

function makeBlankRow(): MailPersonRow {
  // New blank rows start with empty sabun/name/mailId.
  // The EmployeePicker render callback detects blank rows
  // (name === "" && mailId === "") and renders a picker combobox
  // in the sabun cell so the user can fill all three fields at once.
  // createdAt is omitted — DB defaultNow assigns on save; UI shows "—".
  return {
    id: crypto.randomUUID(),
    sabun: "",
    name: "",
    mailId: "",
    salesYn: false,
    insaYn: false,
    memo: null,
    createdAt: null,
  };
}

export function MailPersonsGridContainer({
  rows: initialRows,
  total: initialTotal,
  page: initialPage,
  limit,
  initialFilters,
}: Props) {
  const [rows, setRows] = useState<MailPersonRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useState<Omit<FilterValues, "page">>({
    searchMail: initialFilters?.searchMail ?? "",
    name: initialFilters?.name ?? "",
    sabun: initialFilters?.sabun ?? "",
  });
  const setPending = (key: keyof Omit<FilterValues, "page">, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const { values: filterValues, setValue: setFilterValue } = useUrlFilters<FilterValues>({
    defaults: {
      searchMail: initialFilters?.searchMail ?? "",
      name: initialFilters?.name ?? "",
      sabun: initialFilters?.sabun ?? "",
      page: String(initialPage),
    },
  });

  const currentPage = Math.max(1, Number(filterValues.page) || 1);

  const reload = useCallback(
    (nextPage: number, filters: FilterValues) => {
      startTransition(async () => {
        const res = await listMailPersons({
          searchMail: filters.searchMail || undefined,
          name: filters.name || undefined,
          sabun: filters.sabun || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as MailPersonRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  /**
   * Called by EmployeePicker in the sabun render cell for brand-new blank rows.
   * Auto-saves the row with picked values then reloads, matching ibsheet popup
   * behaviour (picker commit ≠ grid save button flow).
   *
   * After a successful save+reload we bump `reloadKey` so that <DataGrid> is
   * remounted with the fresh `rows` prop. Without this, DataGrid's internal
   * useGridState (lazy useState) would keep the old blank "new" row in its
   * internal state even though the container's `rows` has been updated.
   */
  const handleEmployeePick = useCallback(
    (rowId: string, hit: { sabun: string; name: string; email: string }) => {
      startTransition(async () => {
        const result = await saveMailPersons({
          creates: [
            {
              id: rowId,
              sabun: hit.sabun,
              name: hit.name,
              mailId: hit.email,
              salesYn: false,
              insaYn: false,
              memo: null,
              createdAt: null,
            },
          ],
          updates: [],
          deletes: [],
        });
        if (result.ok) {
          reload(currentPage, filterValues);
          // Remount DataGrid so its internal lazy useState re-initialises
          // from the freshly reloaded `rows`. Only happens on picker flow.
          setReloadKey((k) => k + 1);
        } else {
          const msg =
            "errors" in result
              ? result.errors?.map((e: { message: string }) => e.message).join("\n")
              : undefined;
          toast({
            variant: "destructive",
            title: "저장 실패",
            description: msg ?? "저장 실패",
          });
        }
      });
    },
    [currentPage, filterValues, reload],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await exportMailPersonsToExcel({
        searchMail: filterValues.searchMail || undefined,
        name: filterValues.name || undefined,
        sabun: filterValues.sabun || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      }
    } finally {
      setIsExporting(false);
    }
  }, [filterValues]);

  // COLUMNS defined inside component so render callbacks close over handleEmployeePick.
  // Legacy ibSheet bizMailPersonMgr.jsp Hidden:0 columns + sabun:
  //   enterCd  Hidden:1  (implicit via workspaceId)
  //   sabun    Hidden:0, UpdateEdit:0, InsertEdit:0 → visible; picker-only on new rows
  //   name     Hidden:0, UpdateEdit:0, InsertEdit:1 → editable on insert (auto-filled by picker)
  //   mailId   Hidden:0, UpdateEdit:0, InsertEdit:1 → editable on insert (auto-filled by picker)
  //   salesYn  Hidden:0, UpdateEdit:1, InsertEdit:1
  //   insaYn   Hidden:0, UpdateEdit:1, InsertEdit:1
  //   memo     Hidden:0, UpdateEdit:1, InsertEdit:1
  // Composite KeyField dedup: sabun + mailId
  const COLUMNS: ColumnDef<MailPersonRow>[] = [
    {
      key: "sabun",
      label: "사번",
      type: "readonly",
      width: 110,
      render: (row) => {
        // Blank new row → show EmployeePicker; existing rows → plain text.
        const isBlankNew = row.name === "" && row.mailId === "";
        if (isBlankNew) {
          return (
            <EmployeePicker
              value=""
              placeholder="사번 검색..."
              search={(q, lim) => searchEmployees({ q, limit: lim })}
              onSelect={(hit) => handleEmployeePick(row.id, hit)}
            />
          );
        }
        return <span className="text-[13px] text-slate-900">{row.sabun}</span>;
      },
    },
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

  const handlePageChange = useCallback(
    (p: number) => {
      setFilterValue("page", String(p));
      reload(p, filterValues);
    },
    [filterValues, setFilterValue, reload],
  );

  const handleSearch = useCallback(() => {
    setFilterValue("searchMail", pendingFilters.searchMail);
    setFilterValue("name", pendingFilters.name);
    setFilterValue("sabun", pendingFilters.sabun);
    setFilterValue("page", "1");
    reload(1, { ...filterValues, ...pendingFilters, page: "1" });
  }, [pendingFilters, filterValues, setFilterValue, reload]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label="메일주소" className="w-[210px]">
          <Input
            type="text"
            data-filter="searchMail"
            value={pendingFilters.searchMail}
            onChange={(e) => setPending("searchMail", e.target.value)}
            placeholder="메일주소 검색"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="이름" className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.name}
            onChange={(e) => setPending("name", e.target.value)}
            placeholder="이름"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="사번" className="w-[140px]">
          <Input
            type="text"
            value={pendingFilters.sabun}
            onChange={(e) => setPending("sabun", e.target.value)}
            placeholder="사번"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<MailPersonRow>
        key={reloadKey}
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={handlePageChange}
        onFilterChange={() => {
          // Filters managed by GridSearchForm above
        }}
        onSave={async (changes) => {
          // Composite-key duplicate check before save (sabun + mailId).
          const existingMerged = rows
            .filter((r) => !changes.deletes.includes(r.id))
            .map((r) => {
              const upd = changes.updates.find((u) => u.id === r.id);
              return upd ? { ...r, ...upd.patch } : r;
            });
          const allRows = [...changes.creates, ...existingMerged];
          const dups = findDuplicateKeys(allRows, ["sabun", "mailId"]);
          if (dups.length > 0) {
            return {
              ok: false,
              errors: [{ message: `중복된 키(사번+메일ID)가 있습니다: ${dups.join(", ")}` }],
            };
          }
          const result = await saveMailPersons(changes);
          if (result.ok) {
            reload(currentPage, filterValues);
          }
          return result;
        }}
      />
    </div>
  );
}
