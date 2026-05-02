"use client";
/**
 * apps/web/app/(app)/admin/users/_components/UsersGridContainer.tsx
 *
 * users 도메인 DataGrid 래퍼.
 * admin/users/page.tsx에서 import해 사용.
 * Follows the same shape as admin/companies/_components/CompaniesGridContainer.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type UserRow } from "@jarvis/shared/validation/admin/user";
import { listUsers, saveUsers } from "../actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/grid/DataGrid";
import { type GridRow, overlayGridRows, rowsToBatch } from "@/components/grid/useGridState";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type { ColumnDef } from "@/components/grid/types";

type User = UserRow;
type Option = { value: string; label: string };

type Props = {
  initialRows: User[];
  initialTotal: number;
  initialFilters: { q: string; status: string; orgId: string };
  workspaceId: string;
  orgOptions: Option[];
  positionOptions: Option[];
  jobTitleOptions: Option[];
};

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
  { value: "locked", label: "locked" },
];

function makeBlankRow(workspaceId: string): User {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId,
    employeeId: "",
    name: "",
    email: null,
    phone: null,
    orgId: null,
    orgName: null,
    position: null,
    jobTitle: null,
    status: "active",
    isOutsourced: false,
    employmentType: "internal",
    updatedBy: null,
    updatedByName: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function UsersGridContainer({
  initialRows,
  initialTotal,
  initialFilters,
  workspaceId,
  orgOptions,
  positionOptions,
  jobTitleOptions,
}: Props) {
  const t = useTranslations("Admin.Users.Grid");

  const [rows, setRows] = useState<User[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [page, setPage] = useTabState<number>("admin.users.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "admin.users.filters",
    {
      q: initialFilters.q,
      status: initialFilters.status,
      orgId: initialFilters.orgId,
    },
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "admin.users.pendingFilters",
    {
      q: initialFilters.q,
      status: initialFilters.status,
      orgId: initialFilters.orgId,
    },
  );
  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<User>[]>(
    "admin.users.gridRows",
    [],
  );
  const [isExporting, setIsExporting] = useState(false);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [isSearching, startTransition] = useTransition();
  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  useTabDirty(dirtyCount > 0);

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/admin/users";
  const tabKey = pathnameToTabKey(pathname);
  const initialGridRows = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(initialRows, gridRowsCache.length > 0 ? gridRowsCache : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const ctx = useTabContext();
  const gridRowsCacheRef = useRef(gridRowsCache);
  gridRowsCacheRef.current = gridRowsCache;
  useEffect(() => {
    return ctx.registerSaveHandler(tabKey, async () => {
      const changes = rowsToBatch(gridRowsCacheRef.current);
      if (
        changes.creates.length === 0 &&
        changes.updates.length === 0 &&
        changes.deletes.length === 0
      ) {
        return { ok: true };
      }
      const result = await saveUsers({
        creates: changes.creates.map((c) => ({
          id: c.id,
          employeeId: c.employeeId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          orgId: c.orgId,
          position: c.position,
          jobTitle: c.jobTitle,
          status: c.status,
          isOutsourced: c.isOutsourced,
        })),
        updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>) => {
      startTransition(async () => {
        const res = await listUsers({
          q: nextFilters.q || undefined,
          status:
            nextFilters.status && nextFilters.status !== "all"
              ? nextFilters.status
              : undefined,
          orgId: nextFilters.orgId || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (res.ok) {
          setRows(res.rows as User[]);
          setTotalCount(res.total as number);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [],
  );

  // Translate status options labels at render time
  const statusOptionsTranslated = useMemo<Option[]>(
    () =>
      STATUS_OPTIONS.map((o) => ({
        value: o.value,
        label: t(`status.${o.value}`),
      })),
    [t],
  );

  const COLUMNS: ColumnDef<User>[] = useMemo(
    () => [
      {
        key: "employeeId",
        label: t("columns.employeeId"),
        type: "text",
        width: 100,
        editable: true,
        required: true,
      },
      {
        key: "name",
        label: t("columns.name"),
        type: "text",
        width: 120,
        editable: true,
        required: true,
      },
      {
        key: "email",
        label: t("columns.email"),
        type: "text",
        width: 200,
        editable: true,
      },
      {
        key: "phone",
        label: t("columns.phone"),
        type: "text",
        width: 130,
        editable: true,
      },
      {
        key: "orgId",
        label: t("columns.org"),
        type: "select",
        width: 150,
        editable: true,
        options: orgOptions,
      },
      {
        key: "position",
        label: t("columns.position"),
        type: "select",
        width: 110,
        editable: true,
        options: positionOptions,
      },
      {
        key: "jobTitle",
        label: t("columns.jobTitle"),
        type: "select",
        width: 110,
        editable: true,
        options: jobTitleOptions,
      },
      {
        key: "status",
        label: t("columns.status"),
        type: "select",
        width: 100,
        editable: true,
        required: true,
        options: statusOptionsTranslated,
      },
      {
        key: "isOutsourced",
        label: t("columns.isOutsourced"),
        type: "boolean",
        width: 80,
        editable: true,
      },
      {
        key: "updatedByName",
        label: t("columns.updatedBy"),
        type: "readonly",
        width: 120,
      },
      {
        key: "updatedAt",
        label: t("columns.updatedAt"),
        type: "readonly",
        width: 160,
      },
    ],
    [t, orgOptions, positionOptions, jobTitleOptions, statusOptionsTranslated],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = COLUMNS.map((c) => ({
        key: c.key as string,
        header: c.label,
      }));
      const orgMap = new Map(orgOptions.map((o) => [o.value, o.label]));
      const positionMap = new Map(positionOptions.map((o) => [o.value, o.label]));
      const jobTitleMap = new Map(jobTitleOptions.map((o) => [o.value, o.label]));
      const statusMap = new Map(statusOptionsTranslated.map((o) => [o.value, o.label]));

      const res = await listUsers({ page: 1, limit: 10000 });
      const exportRows = res.ok ? (res.rows as User[]) : rows;

      await exportToExcel({
        filename: "사용자관리",
        sheetName: "사용자",
        columns: exportColumns,
        rows: exportRows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          if (col.key === "isOutsourced") return v ? "Y" : "N";
          if (col.key === "orgId" && typeof v === "string")
            return orgMap.get(v) ?? v;
          if (col.key === "position" && typeof v === "string")
            return positionMap.get(v) ?? v;
          if (col.key === "jobTitle" && typeof v === "string")
            return jobTitleMap.get(v) ?? v;
          if (col.key === "status" && typeof v === "string")
            return statusMap.get(v) ?? v;
          if (col.key === "updatedAt" && typeof v === "string")
            return v.slice(0, 19).replace("T", " ");
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
            return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [COLUMNS, rows, orgOptions, positionOptions, jobTitleOptions, statusOptionsTranslated]);

  return (
    <div className="space-y-3">
      <GridSearchForm
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label="조직" className="w-[140px]">
          <select
            value={pendingFilters.orgId ?? ""}
            onChange={(e) => setPending("orgId", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {orgOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="상태" className="w-[140px]">
          <select
            value={pendingFilters.status ?? ""}
            onChange={(e) => setPending("status", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {statusOptionsTranslated.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="검색" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("filters.search")}
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<User>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={[]}
        page={page}
        limit={PAGE_SIZE}
        makeBlankRow={() => makeBlankRow(workspaceId)}
        filterValues={filterValues}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onDirtyChange={setDirtyCount}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async (changes) => {
          const result = await saveUsers({
            creates: changes.creates.map((c) => ({
              id: c.id,
              employeeId: c.employeeId,
              name: c.name,
              email: c.email,
              phone: c.phone,
              orgId: c.orgId,
              position: c.position,
              jobTitle: c.jobTitle,
              status: c.status,
              isOutsourced: c.isOutsourced,
            })),
            updates: changes.updates.map((u) => ({ id: u.id, ...u.patch })),
            deletes: changes.deletes,
          });
          if (result.ok) {
            reload(page, filterValues);
          }
          return {
            ok: result.ok,
            errors: result.ok
              ? []
              : result.error
                ? [{ message: result.error }]
                : [],
          };
        }}
      />
    </div>
  );
}
