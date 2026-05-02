"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { calcManday } from "@/lib/utils/calcManday";
import { type GridRow, overlayGridRows, rowsToBatch } from "@/components/grid/useGridState";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type { ColumnDef } from "@/components/grid/types";
import { listContractServices, saveContractServices } from "../actions";
import { exportContractServicesToExcel } from "../export";
import type { SalesContractServiceRow } from "@jarvis/shared/validation/sales-contract";
import { contractServicesColumns } from "./columns";

type FilterState = {
  q: string;
  pjtCd: string;
  attendCd: string;
  page: string;
};

type Props = {
  rows: SalesContractServiceRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesContractServiceRow {
  const id = crypto.randomUUID();
  return {
    id,
    workspaceId: "",
    legacyEnterCd: null,
    legacySymd: null,
    legacyServSabun: null,
    servSabun: "",
    servName: null,
    birYmd: null,
    symd: null,
    eymd: null,
    cpyGbCd: null,
    cpyName: null,
    econtAmt: null,
    econtCnt: null,
    job: null,
    tel: null,
    mail: null,
    addr: null,
    attendCd: null,
    skillCd: null,
    cmmncCd: null,
    rsponsCd: null,
    memo1: null,
    memo2: null,
    memo3: null,
    orgCd: null,
    manager: null,
    pjtCd: null,
    pjtNm: null,
    etc1: null,
    etc2: null,
    etc3: null,
    etc4: null,
    etc5: null,
    etc6: null,
    etc7: null,
    etc8: null,
    etc9: null,
    etc10: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function ContractServicesGridContainer({
  rows: initialRows,
  total: initialTotal,
  limit,
  initialFilters,
}: Props) {
  const common = useTranslations("Sales.Common");
  const tContractServices = useTranslations("Sales.ContractServices");

  const { values: urlFilters, setValue: setUrlFilter } = useUrlFilters<FilterState>({
    defaults: initialFilters,
  });

  const currentPage = Math.max(1, parseInt(urlFilters.page || "1", 10) || 1);

  const [rows, setRows] = useState<SalesContractServiceRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [isExporting, setIsExporting] = useState(false);
  const [isSearching, startTransition] = useTransition();

  const [pendingFilters, setPendingFilters] = useTabState<FilterState>(
    "sales.contractServices.pendingFilters",
    {
      q: initialFilters.q,
      pjtCd: initialFilters.pjtCd,
      attendCd: initialFilters.attendCd,
      page: initialFilters.page,
    },
  );
  const setPending = (key: keyof FilterState, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const [gridRowsCache, setGridRowsCache] = useTabState<GridRow<SalesContractServiceRow>[]>(
    "sales.contractServices.gridRows",
    [],
  );
  const [dirtyCount, setDirtyCount] = useState(0);
  useTabDirty(dirtyCount > 0);

  // ---------------------------------------------------------------------------
  // M/M (manday) auto-calculation — legacy contractServMgr.jsp parity
  // ---------------------------------------------------------------------------
  // The TBIZ010 schema (SalesContractServiceRow) has no `manday` column today,
  // so the computed value lives in client-only state and surfaces via toast.
  // - mandayByRowId: rowId → computed manday (informational display only).
  // - mandayOverrides: rowId set — rows where the user manually overrode M/M.
  //   New rows reset (clear from override set on insert/blank); the toolbar
  //   button below recomputes only for rows NOT in this set.
  //
  // TODO(schema): once a `manday` column is added to TBIZ010 + zod schema,
  //   wire mandayByRowId into row.patch via `onGridRowsChange` and surface it
  //   as a numeric column in `columns.ts`. For now the calc is a UX preview
  //   that lets the user verify symd/eymd ranges before saving.
  // TODO(holidays): integrate `useWorkspaceHolidays` (currently scoped to a
  //   single calendar month) — for ranges spanning multiple months we need
  //   either a wider range fetch (`/api/holidays/range?from=...&to=...`) or a
  //   helper that fetches the spanned months. Empty Set is a safe default
  //   (matches "no holidays defined" — falls back to weekday/Sat/Sun weights).
  const [mandayByRowId, setMandayByRowId] = useState<Map<string, number>>(new Map());
  const [mandayOverrides, setMandayOverrides] = useState<Set<string>>(new Set());
  const [isRecalcManday, setIsRecalcManday] = useState(false);

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/sales/contract-services";
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
      const liveRows = gridRowsCacheRef.current
        .filter((r) => r.state !== "deleted")
        .map((r) => r.data);
      const dups = findDuplicateKeys(liveRows, [
        "legacyEnterCd",
        "legacySymd",
        "legacyServSabun",
      ]);
      if (dups.length > 0) {
        return { ok: false };
      }
      const result = await saveContractServices(changes);
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterState) => {
      startTransition(async () => {
        const res = await listContractServices({
          q: nextFilters.q || undefined,
          pjtCd: nextFilters.pjtCd || undefined,
          attendCd: nextFilters.attendCd || undefined,
          page: nextPage,
          limit,
        });
        if (res.ok) {
          setRows(res.rows as SalesContractServiceRow[]);
          setTotal(res.total);
        }
      });
    },
    [limit],
  );

  const COLUMNS: ColumnDef<SalesContractServiceRow>[] = contractServicesColumns;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportContractServicesToExcel({
        q: urlFilters.q || undefined,
        pjtCd: urlFilters.pjtCd || undefined,
        attendCd: urlFilters.attendCd || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        toast({
          variant: "destructive",
          title: common("Excel.exportFailed"),
          description: common("Excel.exportFailedDesc", { message: result.error ?? "" }),
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = useCallback(() => {
    setUrlFilter("q", pendingFilters.q);
    setUrlFilter("pjtCd", pendingFilters.pjtCd);
    setUrlFilter("attendCd", pendingFilters.attendCd);
    setUrlFilter("page", "1");
    reload(1, { ...pendingFilters, page: "1" });
  }, [pendingFilters, setUrlFilter, reload]);

  /**
   * Recalculate M/M for every grid row that has both `symd` and `eymd`
   * filled and is NOT in the override set. Computed values land in
   * `mandayByRowId` (client-only display). Holidays Set is empty until the
   * holiday-range fetch is integrated (see TODO above).
   */
  const handleRecalcManday = useCallback(() => {
    setIsRecalcManday(true);
    try {
      const cache = gridRowsCacheRef.current;
      const liveRows = cache.filter((r) => r.state !== "deleted").map((r) => r.data);
      const next = new Map(mandayByRowId);
      let computed = 0;
      let skipped = 0;
      let invalid = 0;
      let total = 0;
      const holidays = new Set<string>(); // TODO: wire workspace holidays.
      for (const row of liveRows) {
        if (mandayOverrides.has(row.id)) {
          skipped += 1;
          continue;
        }
        const value = calcManday(row.symd, row.eymd, holidays);
        if (value === null) {
          invalid += 1;
          next.delete(row.id);
          continue;
        }
        next.set(row.id, value);
        computed += 1;
        total += value;
      }
      setMandayByRowId(next);
      const totalDisplay = Math.round(total * 10) / 10;
      toast({
        title: tContractServices("actions.recalcManday"),
        description: tContractServices("toast.recalcMandayDone", {
          computed,
          skipped,
          invalid,
          total: totalDisplay,
        }),
      });
    } finally {
      setIsRecalcManday(false);
    }
  }, [mandayByRowId, mandayOverrides, tContractServices]);

  /**
   * When grid rows change (cell commit / insert / delete), drop stale entries
   * from override + computed maps so newly-inserted rows start in auto-calc
   * mode and removed rows don't keep ghost entries.
   */
  useEffect(() => {
    const liveIds = new Set(gridRowsCache.map((r) => r.data.id));
    let mutatedOverrides = false;
    const nextOverrides = new Set<string>();
    for (const id of mandayOverrides) {
      if (liveIds.has(id)) nextOverrides.add(id);
      else mutatedOverrides = true;
    }
    if (mutatedOverrides) setMandayOverrides(nextOverrides);

    let mutatedManday = false;
    const nextManday = new Map<string, number>();
    for (const [id, v] of mandayByRowId) {
      if (liveIds.has(id)) nextManday.set(id, v);
      else mutatedManday = true;
    }
    if (mutatedManday) setMandayByRowId(nextManday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRowsCache]);

  return (
    <div className="space-y-3">
      <GridSearchForm onSearch={handleSearch} isSearching={isSearching}>
        <GridFilterField label="검색어" className="w-[240px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="이름 / 직무 / 사번"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="프로젝트코드" className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.pjtCd}
            onChange={(e) => setPending("pjtCd", e.target.value)}
            placeholder="프로젝트코드"
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label="근태코드" className="w-[160px]">
          <Input
            type="text"
            value={pendingFilters.attendCd}
            onChange={(e) => setPending("attendCd", e.target.value)}
            placeholder="근태코드"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRecalcManday}
          disabled={isRecalcManday}
        >
          {tContractServices("actions.recalcManday")}
        </Button>
      </div>

      <DataGrid<SalesContractServiceRow>
        rows={rows}
        total={total}
        columns={COLUMNS}
        filters={[]}
        page={currentPage}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={{}}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onDirtyChange={setDirtyCount}
        onExport={handleExport}
        isExporting={isExporting}
        onPageChange={(p) => {
          setUrlFilter("page", String(p));
          reload(p, { ...urlFilters, page: String(p) });
        }}
        onFilterChange={() => {
          // Filters managed by GridSearchForm above
        }}
        onSave={async (changes) => {
          // Composite-key dedup guard: (legacyEnterCd|legacySymd|legacyServSabun) is UNIQUE.
          const allRows = [
            ...changes.creates,
            ...rows
              .filter((r) => !changes.deletes.includes(r.id))
              .map((r) => {
                const upd = changes.updates.find((u) => u.id === r.id);
                return upd ? { ...r, ...upd.patch } : r;
              }),
          ];
          const dupes = findDuplicateKeys(allRows, [
            "legacyEnterCd",
            "legacySymd",
            "legacyServSabun",
          ]);
          if (dupes.length > 0) {
            return {
              ok: false as const,
              errors: dupes.map((k) => ({
                message: `중복된 용역키(enterCd|symd|servSabun)가 있습니다: ${k}`,
              })),
            };
          }
          const result = await saveContractServices(changes);
          if (result.ok) reload(currentPage, urlFilters);
          return {
            ok: result.ok,
            ...(result.errors && result.errors.length > 0
              ? { errors: result.errors.map((e) => ({ message: e.message })) }
              : {}),
          };
        }}
      />
    </div>
  );
}
