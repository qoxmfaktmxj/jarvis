"use client";
/**
 * apps/web/app/(app)/infra/_components/InfraSystemsGridContainer.tsx
 *
 * 인프라구성관리 (Plan 5) Grid container.
 *
 * 11 컬럼: company / systemName / envType / dbType / dbVersion / osType /
 *          domainAddr / port / connectMethod / deployMethod / ownerName / [Runbook]
 * (+ readonly audit: updatedBy/updatedAt — admin/companies grid 표준)
 *
 * Composite-key dedup: (companyId, systemName, envType) — schema의 uniqueIndex와 일치.
 *
 * Server action wired:
 *   - listInfraSystems (reload 시)
 *   - saveInfraSystems (batch creates/updates/deletes)
 *   - exportInfraSystems (Excel — full data + audit log)
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import {
  type GridRow,
  overlayGridRows,
  rowsToBatch,
} from "@/components/grid/useGridState";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type {
  ColumnDef,
  GridChanges,
  GridSaveResult,
} from "@/components/grid/types";
import type { InfraSystemListRow } from "@jarvis/shared/validation/infra/system";
import { listInfraSystems, saveInfraSystems } from "../actions";
import { exportInfraSystems } from "../export";
import { makeBlankInfraSystem } from "./useInfraSystemsGridState";

type Option = { value: string; label: string };

type Props = {
  initialRows: InfraSystemListRow[];
  initialTotal: number;
  page: number;
  limit: number;
  companyOptions: Option[];
  initialQ?: string;
  initialCompanyId?: string;
  initialEnvType?: string;
  initialDbType?: string;
};

const ENV_TYPE_OPTIONS: Option[] = [
  { value: "prod", label: "운영" },
  { value: "staging", label: "스테이징" },
  { value: "dev", label: "개발" },
  { value: "dr", label: "DR" },
];

const DB_TYPE_OPTIONS: Option[] = [
  { value: "oracle", label: "Oracle" },
  { value: "tibero", label: "Tibero" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mssql", label: "MS-SQL" },
];

function InfraSystemsGridInner({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  companyOptions,
  initialQ = "",
  initialCompanyId = "",
  initialEnvType = "",
  initialDbType = "",
}: Props) {
  const t = useTranslations("Infra");
  const tCommon = useTranslations("Common");
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [exporting, startExport] = useTransition();
  const [dupError, setDupError] = useState<string | null>(null);
  const [isSearching, startReload] = useTransition();

  const [pendingFilters, setPendingFilters] = useTabState<{
    q: string;
    companyId: string;
    envType: string;
    dbType: string;
  }>("infra.systems.pendingFilters", {
    q: initialQ,
    companyId: initialCompanyId,
    envType: initialEnvType,
    dbType: initialDbType,
  });
  const setPending = (key: keyof typeof pendingFilters, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const { values: filterValues, setValue: setFilterValue } = useUrlFilters({
    defaults: {
      q: initialQ,
      companyId: initialCompanyId,
      envType: initialEnvType,
      dbType: initialDbType,
      page: String(initialPage),
    },
  });

  const [gridRowsCache, setGridRowsCache] = useTabState<
    GridRow<InfraSystemListRow>[]
  >("infra.systems.gridRows", []);
  const [dirtyCount, setDirtyCount] = useState(0);
  useTabDirty(dirtyCount > 0);

  const tabKeyRef = useRef<string | null>(null);
  const pathname = usePathname() ?? "/infra";
  const tabKey = pathnameToTabKey(pathname);
  const initialGridRows = useMemo(() => {
    if (tabKeyRef.current === tabKey) return undefined;
    tabKeyRef.current = tabKey;
    return overlayGridRows(
      initialRows,
      gridRowsCache.length > 0 ? gridRowsCache : undefined,
    );
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
      if (changes.creates.length > 0) {
        const dups = findDuplicateKeys(
          changes.creates as unknown as Record<string, unknown>[],
          ["companyId", "systemName", "envType"],
        );
        if (dups.length > 0) return { ok: false };
      }
      const result = await saveInfraSystems({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, tabKey]);

  const reload = useCallback(
    (
      nextPage: number,
      nextQ: string,
      nextCompanyId: string,
      nextEnvType: string,
      nextDbType: string,
    ) => {
      startReload(async () => {
        const res = await listInfraSystems({
          q: nextQ || undefined,
          companyId: nextCompanyId || undefined,
          envType: nextEnvType || undefined,
          dbType: nextDbType || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    [limit],
  );

  const columns: ColumnDef<InfraSystemListRow>[] = useMemo(
    () => [
      {
        key: "companyId",
        label: t("columns.company"),
        type: "select",
        editable: true,
        required: true,
        options: companyOptions,
        width: 220,
      },
      {
        key: "systemName",
        label: t("columns.systemName"),
        type: "text",
        editable: true,
        required: true,
        width: 200,
      },
      {
        key: "envType",
        label: t("columns.envType"),
        type: "select",
        editable: true,
        options: ENV_TYPE_OPTIONS,
        width: 110,
      },
      {
        key: "dbType",
        label: t("columns.dbType"),
        type: "select",
        editable: true,
        options: DB_TYPE_OPTIONS,
        width: 110,
      },
      {
        key: "dbVersion",
        label: t("columns.dbVersion"),
        type: "text",
        editable: true,
        width: 100,
      },
      {
        key: "osType",
        label: t("columns.osType"),
        type: "text",
        editable: true,
        width: 110,
      },
      {
        key: "domainAddr",
        label: t("columns.domainAddr"),
        type: "text",
        editable: true,
        width: 220,
      },
      {
        key: "port",
        label: t("columns.port"),
        type: "numeric",
        editable: true,
        width: 80,
      },
      {
        key: "connectMethod",
        label: t("columns.connectMethod"),
        type: "text",
        editable: true,
        width: 120,
      },
      {
        key: "deployMethod",
        label: t("columns.deployMethod"),
        type: "text",
        editable: true,
        width: 120,
      },
      {
        key: "ownerName",
        label: t("columns.ownerName"),
        type: "text",
        editable: true,
        width: 110,
      },
      {
        key: "wikiPageRouteKey",
        label: t("columns.runbook"),
        type: "readonly",
        width: 130,
        render: (row) =>
          row.wikiPageRouteKey
            ? row.wikiPageTitle ?? row.wikiPageRouteKey
            : t("noRunbook"),
      },
      {
        key: "updatedBy",
        label: t("columns.updatedBy"),
        type: "readonly",
        width: 100,
      },
      {
        key: "updatedAt",
        label: t("columns.updatedAt"),
        type: "readonly",
        width: 160,
        render: (row) =>
          row.updatedAt ? row.updatedAt.slice(0, 19).replace("T", " ") : "",
      },
    ],
    [companyOptions, t],
  );

  const handleSave = useCallback(
    async (
      changes: GridChanges<InfraSystemListRow>,
    ): Promise<GridSaveResult> => {
      if (changes.creates.length > 0) {
        const dups = findDuplicateKeys(
          changes.creates as unknown as Record<string, unknown>[],
          ["companyId", "systemName", "envType"],
        );
        if (dups.length > 0) {
          setDupError(`중복된 키가 있습니다: ${dups.join(", ")}`);
          return {
            ok: false,
            errors: [{ message: `중복된 키: ${dups.join(", ")}` }],
          };
        }
      }
      setDupError(null);

      const result = await saveInfraSystems({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        const res = await listInfraSystems({
          q: filterValues.q || undefined,
          companyId: filterValues.companyId || undefined,
          envType: filterValues.envType || undefined,
          dbType: filterValues.dbType || undefined,
          page,
          limit,
        });
        if (!("error" in res)) setTotal(res.total);
      }
      return result;
    },
    [filterValues, page, limit],
  );

  const handleExport = useCallback(() => {
    startExport(async () => {
      const result = await exportInfraSystems({
        q: filterValues.q || undefined,
        companyId: filterValues.companyId || undefined,
        envType: filterValues.envType || undefined,
        dbType: filterValues.dbType || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        toast({
          variant: "destructive",
          title: tCommon("Excel.failed") ?? "엑셀 내보내기 실패",
          description: result.error,
        });
      }
    });
  }, [filterValues, tCommon]);

  return (
    <div className="space-y-3">
      <GridSearchForm
        onSearch={() => {
          setFilterValue("q", pendingFilters.q);
          setFilterValue("companyId", pendingFilters.companyId);
          setFilterValue("envType", pendingFilters.envType);
          setFilterValue("dbType", pendingFilters.dbType);
          setFilterValue("page", "1");
          reload(
            1,
            pendingFilters.q,
            pendingFilters.companyId,
            pendingFilters.envType,
            pendingFilters.dbType,
          );
        }}
        isSearching={isSearching}
      >
        <GridFilterField label={t("columns.systemName")} className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("columns.company")} className="w-[200px]">
          <select
            className="h-8 w-full rounded border border-(--border-default) bg-(--bg-page) px-2 text-[13px]"
            value={pendingFilters.companyId}
            onChange={(e) => setPending("companyId", e.target.value)}
          >
            <option value="">{t("filters.allCompanies")}</option>
            {companyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("columns.envType")} className="w-[140px]">
          <select
            className="h-8 w-full rounded border border-(--border-default) bg-(--bg-page) px-2 text-[13px]"
            value={pendingFilters.envType}
            onChange={(e) => setPending("envType", e.target.value)}
          >
            <option value="">{t("filters.allEnvs")}</option>
            {ENV_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("columns.dbType")} className="w-[140px]">
          <select
            className="h-8 w-full rounded border border-(--border-default) bg-(--bg-page) px-2 text-[13px]"
            value={pendingFilters.dbType}
            onChange={(e) => setPending("dbType", e.target.value)}
          >
            <option value="">{t("filters.allDbTypes")}</option>
            {DB_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        {pendingFilters.q ||
        pendingFilters.companyId ||
        pendingFilters.envType ||
        pendingFilters.dbType ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPendingFilters({
                q: "",
                companyId: "",
                envType: "",
                dbType: "",
              });
            }}
            className="px-2 text-[12px]"
          >
            초기화
          </Button>
        ) : null}
      </GridSearchForm>

      {dupError ? (
        <div
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {dupError}
        </div>
      ) : null}

      <DataGrid<InfraSystemListRow>
        rows={initialRows}
        total={total}
        columns={columns}
        filters={[]}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankInfraSystem}
        initialGridRows={initialGridRows}
        onGridRowsChange={setGridRowsCache}
        onDirtyChange={setDirtyCount}
        onExport={handleExport}
        isExporting={exporting}
        onPageChange={(nextPage) => {
          setFilterValue("page", String(nextPage));
          reload(
            nextPage,
            filterValues.q,
            filterValues.companyId,
            filterValues.envType,
            filterValues.dbType,
          );
        }}
        onFilterChange={() => {
          /* external filters managed in strip above; DataGrid filters[] is empty */
        }}
        onSave={handleSave}
        emptyMessage={t("empty")}
      />
    </div>
  );
}

export function InfraSystemsGridContainer(props: Props) {
  return (
    <Suspense fallback={null}>
      <InfraSystemsGridInner {...props} />
    </Suspense>
  );
}
