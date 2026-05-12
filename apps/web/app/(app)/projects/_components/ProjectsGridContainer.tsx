"use client";
/**
 * apps/web/app/(app)/projects/_components/ProjectsGridContainer.tsx
 *
 * /projects DataGrid container — pagination, inline editing, batch save.
 *
 * Visible columns (10):
 *   companyId(select) · name(text req) · status(select) · ownerName(readonly) ·
 *   prodConnectType(select) · prodDomainUrl(text) · devConnectType(select) ·
 *   devDomainUrl(text) · description(text) · updatedAt(readonly)
 *
 * Editable: companyId, name, status, prodConnectType, prodDomainUrl,
 *           devConnectType, devDomainUrl, description.
 *
 * Schema constraint: one project per (workspaceId, companyId). Server returns
 * DUPLICATE on conflict.
 */
import {
  Suspense,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import type {
  ColumnDef,
  GridChanges,
  GridSaveResult,
} from "@/components/grid/types";
import type { ProjectListRow } from "@jarvis/shared/validation/project";
import { listProjectsAction, saveProjects } from "../actions";
import { exportProjects } from "../export";
import { makeBlankProject } from "./useProjectsGridState";

type Option = { value: string; label: string };

type Props = {
  initialRows: ProjectListRow[];
  initialTotal: number;
  page: number;
  limit: number;
  companyOptions: Option[];
  initialQ?: string;
  initialStatus?: string;
  initialConnectType?: string;
};

const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "활성" },
  { value: "deprecated", label: "단종" },
  { value: "decommissioned", label: "폐기" },
];

const CONNECT_TYPE_OPTIONS: Option[] = [
  { value: "IP", label: "IP" },
  { value: "VPN", label: "VPN" },
  { value: "VDI", label: "VDI" },
  { value: "RE", label: "RE" },
];

function ProjectsGridInner({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  companyOptions,
  initialQ = "",
  initialStatus = "",
  initialConnectType = "",
}: Props) {
  const t = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const [rows, setRows] = useState<ProjectListRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [exporting, startExport] = useTransition();
  const [isSearching, startReload] = useTransition();

  const [pendingFilters, setPendingFilters] = useState({
    q: initialQ,
    status: initialStatus,
    connectType: initialConnectType,
  });
  const setPending = (key: keyof typeof pendingFilters, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const { values: filterValues, setValue: setFilterValue } = useUrlFilters({
    defaults: {
      q: initialQ,
      status: initialStatus,
      connectType: initialConnectType,
      page: String(initialPage),
    },
  });

  const reload = useCallback(
    (
      nextPage: number,
      nextQ: string,
      nextStatus: string,
      nextConnectType: string,
    ) => {
      startReload(async () => {
        const res = await listProjectsAction({
          q: nextQ || undefined,
          status: (nextStatus as "active" | "deprecated" | "decommissioned") || undefined,
          connectType: (nextConnectType as "IP" | "VPN" | "VDI" | "RE") || undefined,
          page: nextPage,
          limit,
        });
        if ("error" in res) {
          toast({
            variant: "destructive",
            title: tCommon("error") ?? "오류",
            description: res.error,
          });
          return;
        }
        setRows(res.rows);
        setTotal(res.total);
        setPage(nextPage);
      });
    },
    [limit, tCommon],
  );

  const columns: ColumnDef<ProjectListRow>[] = useMemo(
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
        key: "name",
        label: t("columns.name"),
        type: "text",
        editable: true,
        required: true,
        width: 240,
      },
      {
        key: "status",
        label: t("columns.status"),
        type: "select",
        editable: true,
        options: STATUS_OPTIONS,
        width: 100,
      },
      {
        key: "ownerName",
        label: t("columns.owner"),
        type: "readonly",
        width: 120,
      },
      {
        key: "prodConnectType",
        label: t("columns.prodConnectType"),
        type: "select",
        editable: true,
        options: CONNECT_TYPE_OPTIONS,
        width: 100,
      },
      {
        key: "prodDomainUrl",
        label: t("columns.prodDomainUrl"),
        type: "text",
        editable: true,
        width: 240,
      },
      {
        key: "devConnectType",
        label: t("columns.devConnectType"),
        type: "select",
        editable: true,
        options: CONNECT_TYPE_OPTIONS,
        width: 100,
      },
      {
        key: "devDomainUrl",
        label: t("columns.devDomainUrl"),
        type: "text",
        editable: true,
        width: 240,
      },
      {
        key: "description",
        label: t("columns.description"),
        type: "text",
        editable: true,
        width: 220,
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
      changes: GridChanges<ProjectListRow>,
    ): Promise<GridSaveResult> => {
      // Strip join-only columns from creates/updates before sending to server.
      const creates = changes.creates.map((r) => ({
        companyId: r.companyId,
        name: r.name,
        status: r.status,
        ownerId: r.ownerId ?? null,
        description: r.description ?? null,
        prodConnectType: r.prodConnectType ?? null,
        prodDomainUrl: r.prodDomainUrl ?? null,
        devConnectType: r.devConnectType ?? null,
        devDomainUrl: r.devDomainUrl ?? null,
      }));
      const updates = changes.updates.map((u) => ({
        id: u.id,
        patch: {
          ...(u.patch.companyId !== undefined ? { companyId: u.patch.companyId } : {}),
          ...(u.patch.name !== undefined ? { name: u.patch.name } : {}),
          ...(u.patch.status !== undefined ? { status: u.patch.status } : {}),
          ...(u.patch.ownerId !== undefined ? { ownerId: u.patch.ownerId } : {}),
          ...(u.patch.description !== undefined ? { description: u.patch.description } : {}),
          ...(u.patch.prodConnectType !== undefined ? { prodConnectType: u.patch.prodConnectType } : {}),
          ...(u.patch.prodDomainUrl !== undefined ? { prodDomainUrl: u.patch.prodDomainUrl } : {}),
          ...(u.patch.devConnectType !== undefined ? { devConnectType: u.patch.devConnectType } : {}),
          ...(u.patch.devDomainUrl !== undefined ? { devDomainUrl: u.patch.devDomainUrl } : {}),
        },
      }));

      const result = await saveProjects({
        creates,
        updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        const res = await listProjectsAction({
          q: filterValues.q || undefined,
          status: (filterValues.status as "active" | "deprecated" | "decommissioned") || undefined,
          connectType: (filterValues.connectType as "IP" | "VPN" | "VDI" | "RE") || undefined,
          page,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows);
          setTotal(res.total);
        }
      }
      return {
        ok: result.ok,
        errors: result.errors,
      };
    },
    [filterValues, page, limit],
  );

  const handleExport = useCallback(() => {
    startExport(async () => {
      const result = await exportProjects({
        q: filterValues.q || undefined,
        status: (filterValues.status as "active" | "deprecated" | "decommissioned") || undefined,
        connectType: (filterValues.connectType as "IP" | "VPN" | "VDI" | "RE") || undefined,
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
          setFilterValue("status", pendingFilters.status);
          setFilterValue("connectType", pendingFilters.connectType);
          setFilterValue("page", "1");
          reload(1, pendingFilters.q, pendingFilters.status, pendingFilters.connectType);
        }}
        isSearching={isSearching}
      >
        <GridFilterField label={t("columns.name")} className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-8"
          />
        </GridFilterField>
        <GridFilterField label={t("columns.status")} className="w-[140px]">
          <select
            className="h-8 w-full rounded border border-(--border-default) bg-(--bg-page) px-2 text-[13px]"
            value={pendingFilters.status}
            onChange={(e) => setPending("status", e.target.value)}
          >
            <option value="">{t("allStatuses")}</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label={t("columns.prodConnectType")} className="w-[140px]">
          <select
            className="h-8 w-full rounded border border-(--border-default) bg-(--bg-page) px-2 text-[13px]"
            value={pendingFilters.connectType}
            onChange={(e) => setPending("connectType", e.target.value)}
          >
            <option value="">{t("allConnectTypes")}</option>
            {CONNECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        {pendingFilters.q || pendingFilters.status || pendingFilters.connectType ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPendingFilters({ q: "", status: "", connectType: "" });
            }}
            className="px-2 text-[12px]"
          >
            {t("filters.reset")}
          </Button>
        ) : null}
      </GridSearchForm>

      <DataGrid<ProjectListRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankProject}
        onExport={handleExport}
        isExporting={exporting}
        onPageChange={(nextPage) => {
          setFilterValue("page", String(nextPage));
          reload(
            nextPage,
            filterValues.q,
            filterValues.status,
            filterValues.connectType,
          );
        }}
        onFilterChange={() => {
          /* external filters managed via GridSearchForm */
        }}
        onSave={handleSave}
        emptyMessage={t("empty")}
      />
    </div>
  );
}

export function ProjectsGridContainer(props: Props) {
  return (
    <Suspense fallback={null}>
      <ProjectsGridInner {...props} />
    </Suspense>
  );
}
