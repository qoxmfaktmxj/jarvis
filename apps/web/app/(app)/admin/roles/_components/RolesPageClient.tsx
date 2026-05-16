"use client";
/**
 * apps/web/app/(app)/admin/roles/_components/RolesPageClient.tsx
 *
 * /admin/roles 클라이언트 오케스트레이터.
 *  - 마스터(role) + 디테일(role_permission) 그리드 두 개를 horizontal split으로 렌더.
 *  - selectedRoleId 상태를 보유, 마스터 선택 시 listRolePermissions로 디테일 fetch.
 *  - 디테일 unsaved changes가 있을 때 마스터 선택 변경을 UnsavedChangesDialog로 가드.
 *  - 두 그리드 모두 DataGrid 기반.
 *
 * 패턴 출처: apps/web/app/(app)/admin/menus/_components/MenusPageClient.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import {
  type GridRow,
  overlayGridRows,
} from "@/components/grid/useGridState";
import type { GridChanges, GridSaveResult } from "@/components/grid/types";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import type {
  RoleRow,
  RolePermissionRow,
} from "@jarvis/shared/validation/admin/role";
import {
  listRoles,
  listRolePermissions,
  saveRoles,
  saveRolePermissions,
} from "../actions";
import { RoleGrid, getRoleExportColumns } from "./RoleGrid";
import { RolePermissionGrid, getRolePermissionExportColumns } from "./RolePermissionGrid";
import { toGridRows, type RolePermissionGridRow } from "./useRolePermissionGridState";

const MASTER_LIMIT = 100;

type Props = {
  initialRoles: RoleRow[];
  initialRolesTotal: number;
};

type MasterFilters = {
  q: string;
};

const MASTER_DEFAULTS: MasterFilters = { q: "" };

type DetailFilters = {
  q: string;
};

const DETAIL_DEFAULTS: DetailFilters = { q: "" };

export function RolesPageClient({
  initialRoles,
  initialRolesTotal,
}: Props) {
  const t = useTranslations("Admin.Roles");

  // ---- Master rows state ----
  const [masterRowsCache, setMasterRowsCache] = useTabState<GridRow<RoleRow>[]>(
    "admin.roles.masterGridRows",
    [],
  );
  const masterTabKeyRef = useRef<string | null>(null);
  const masterTabKey = "admin.roles";
  const initialMasterRows = useMemo(() => {
    if (masterTabKeyRef.current === masterTabKey) return undefined;
    masterTabKeyRef.current = masterTabKey;
    return overlayGridRows(
      initialRoles,
      masterRowsCache.length > 0 ? masterRowsCache : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTabKey]);

  const [masterRows, setMasterRows] = useState<RoleRow[]>(initialRoles);
  const [masterTotal, setMasterTotal] = useState(initialRolesTotal);

  const [masterGridRows, setMasterGridRows] = useState<GridRow<RoleRow>[]>(
    initialMasterRows ?? [],
  );
  const handleMasterGridRowsChange = useCallback(
    (rows: GridRow<RoleRow>[]) => {
      setMasterGridRows(rows);
      setMasterRowsCache(rows);
    },
    [setMasterRowsCache],
  );

  const [masterDirty, setMasterDirty] = useState(0);
  const [detailDirty, setDetailDirty] = useState(0);

  const masterGridApiRef = useRef<{ discardChanges: () => void } | null>(null);
  const detailGridApiRef = useRef<{ discardChanges: () => void } | null>(null);

  // ---- Detail rows state ----
  const [detailRows, setDetailRows] = useState<RolePermissionGridRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailFullSet, setDetailFullSet] = useState<RolePermissionRow[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // URL-synced master filters
  const {
    values: masterUrlFilters,
    setValues: setMasterUrlValues,
    reset: resetMasterUrl,
  } = useUrlFilters<MasterFilters>({ defaults: MASTER_DEFAULTS });
  const [masterDraft, setMasterDraft] = useState<MasterFilters>(masterUrlFilters);
  useEffect(() => {
    setMasterDraft(masterUrlFilters);
  }, [masterUrlFilters]);

  const [detailDraft, setDetailDraft] = useState<DetailFilters>(DETAIL_DEFAULTS);
  const [detailFilters, setDetailFilters] = useState<DetailFilters>(DETAIL_DEFAULTS);

  const [savingMaster, startMasterSave] = useTransition();
  const [savingDetail, startDetailSave] = useTransition();
  const [, startMasterReload] = useTransition();
  const [, startDetailReload] = useTransition();

  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  useTabDirty(masterDirty > 0 || detailDirty > 0);

  // ---- Master reload ----
  const reloadMaster = useCallback(
    (filters: MasterFilters) => {
      startMasterReload(async () => {
        const res = await listRoles({
          q: filters.q || undefined,
          page: 1,
          limit: MASTER_LIMIT,
        });
        if (!("error" in res)) {
          setMasterRows(res.rows);
          setMasterTotal(res.total);
        }
      });
    },
    [],
  );

  // ---- Detail reload ----
  const applyDetailFilterToRows = useCallback(
    (rows: RolePermissionRow[], filters: DetailFilters) => {
      const q = filters.q.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter(
        (r) =>
          r.permissionCode.toLowerCase().includes(q) ||
          (r.permissionDescription ?? "").toLowerCase().includes(q),
      );
    },
    [],
  );

  const reloadDetail = useCallback(
    (roleId: string | null, filters: DetailFilters) => {
      if (!roleId) {
        setDetailRows([]);
        setDetailTotal(0);
        setDetailFullSet([]);
        return;
      }
      startDetailReload(async () => {
        const res = await listRolePermissions({ roleId });
        if (!("error" in res)) {
          setDetailFullSet(res.rows);
          const filtered = applyDetailFilterToRows(res.rows, filters);
          setDetailRows(toGridRows(filtered));
          setDetailTotal(filtered.length);
        } else {
          setDetailRows([]);
          setDetailTotal(0);
          setDetailFullSet([]);
        }
      });
    },
    [applyDetailFilterToRows],
  );

  // selected role meta
  const selectedRole = useMemo(
    () => masterGridRows.find((r) => r.data.id === selectedRoleId)?.data ?? null,
    [masterGridRows, selectedRoleId],
  );
  const selectedRoleCode = selectedRole?.code ?? null;
  const selectedRoleName = selectedRole?.name ?? null;

  // ---- Master row selection (gated by detail dirty state) ----
  const guardedSelect = useCallback(
    (id: string | null) => {
      if (id === null) return;
      const switchTo = () => {
        setSelectedRoleId(id);
        setDetailDraft(DETAIL_DEFAULTS);
        setDetailFilters(DETAIL_DEFAULTS);
        reloadDetail(id, DETAIL_DEFAULTS);
      };
      if (detailDirty > 0 && id !== selectedRoleId) {
        setPendingNav(() => switchTo);
      } else {
        switchTo();
      }
    },
    [detailDirty, reloadDetail, selectedRoleId],
  );

  // ---- Master save ----
  const handleMasterSave = useCallback(
    async (changes: GridChanges<RoleRow>): Promise<GridSaveResult> => {
      const liveRows = masterGridRows
        .filter((r) => r.state !== "deleted")
        .map((r) => r.data);
      const dups = findDuplicateKeys(liveRows, ["code"]);
      if (dups.length > 0) {
        toast({
          variant: "destructive",
          title: "입력 확인",
          description: t("duplicates", { codes: dups.join(", ") }),
        });
        return { ok: false };
      }

      return new Promise<GridSaveResult>((resolve) => {
        startMasterSave(async () => {
          const result = await saveRoles({
            creates: changes.creates,
            updates: changes.updates,
            deletes: changes.deletes,
          });
          if (result.ok) {
            reloadMaster(masterUrlFilters);
            if (selectedRoleId && changes.deletes.includes(selectedRoleId)) {
              setSelectedRoleId(null);
              setDetailRows([]);
              setDetailTotal(0);
              setDetailFullSet([]);
            }
            resolve({ ok: true });
          } else {
            toast({
              variant: "destructive",
              title: "저장 실패",
              description:
                result.errors?.map((e) => e.message).join("\n") ?? t("saveError"),
            });
            resolve({ ok: false, errors: result.errors });
          }
        });
      });
    },
    [masterGridRows, masterUrlFilters, reloadMaster, selectedRoleId, t],
  );

  // ---- Detail save ----
  const handleDetailSave = useCallback(
    async (changes: GridChanges<RolePermissionGridRow>): Promise<GridSaveResult> => {
      if (!selectedRoleId) return { ok: false };

      const assigned: string[] = [];
      const removed: string[] = [];
      for (const u of changes.updates) {
        if ("assigned" in u.patch) {
          const row = detailRows.find((r) => r.id === u.id);
          if (!row) continue;
          const isAssigned = Boolean(u.patch.assigned);
          if (isAssigned && !row.assigned) assigned.push(row.permissionId);
          else if (!isAssigned && row.assigned) removed.push(row.permissionId);
        }
      }

      if (assigned.length === 0 && removed.length === 0) return { ok: true };

      return new Promise<GridSaveResult>((resolve) => {
        startDetailSave(async () => {
          const result = await saveRolePermissions({
            roleId: selectedRoleId,
            assigned,
            removed,
          });
          if (result.ok) {
            reloadDetail(selectedRoleId, detailFilters);
            reloadMaster(masterUrlFilters);
            resolve({ ok: true });
          } else {
            toast({
              variant: "destructive",
              title: "저장 실패",
              description:
                result.errors?.map((e) => e.message).join("\n") ?? t("saveError"),
            });
            resolve({ ok: false, errors: result.errors });
          }
        });
      });
    },
    [selectedRoleId, detailRows, detailFilters, reloadDetail, reloadMaster, masterUrlFilters, t],
  );

  // ---- Excel export ----
  const handleMasterExport = useCallback(() => {
    const rows = masterGridRows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    if (rows.length === 0) {
      toast({ title: "안내", description: t("noDataToExport") });
      return;
    }
    const columns = getRoleExportColumns(t);
    void exportToExcel<RoleRow, (typeof columns)[number]>({
      filename: "역할_마스터",
      sheetName: t("masterSection.title"),
      columns,
      rows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof RoleRow];
        if (col.key === "isSystem") {
          return v ? "시스템" : "사용자";
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
        return String(v);
      },
    });
  }, [masterGridRows, t]);

  const handleDetailExport = useCallback(() => {
    if (!selectedRoleId) return;
    if (detailRows.length === 0) {
      toast({ title: "안내", description: t("noDataToExport") });
      return;
    }
    const columns = getRolePermissionExportColumns(t);
    const filename = `역할_권한_${selectedRoleCode ?? "role"}`;
    void exportToExcel<RolePermissionGridRow, (typeof columns)[number]>({
      filename,
      sheetName: t("detailSection.title"),
      columns,
      rows: detailRows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof RolePermissionGridRow];
        if (col.key === "assigned") {
          return v ? t("detailSection.assignedY") : t("detailSection.assignedN");
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
        return String(v);
      },
    });
  }, [detailRows, selectedRoleId, selectedRoleCode, t]);

  // ---- Master filter apply / reset ----
  const applyMasterFilters = useCallback(() => {
    masterGridApiRef.current?.discardChanges();
    reloadMaster(masterDraft);
    setMasterUrlValues({ q: masterDraft.q });
  }, [masterDraft, reloadMaster, setMasterUrlValues]);

  const resetMasterFilters = useCallback(() => {
    masterGridApiRef.current?.discardChanges();
    resetMasterUrl();
    setMasterDraft(MASTER_DEFAULTS);
    reloadMaster(MASTER_DEFAULTS);
  }, [reloadMaster, resetMasterUrl]);

  // ---- Detail filter apply / reset (client-side filter over full set) ----
  const applyDetailFilters = useCallback(() => {
    detailGridApiRef.current?.discardChanges();
    setDetailFilters(detailDraft);
    if (selectedRoleId) {
      const filtered = applyDetailFilterToRows(detailFullSet, detailDraft);
      setDetailRows(toGridRows(filtered));
      setDetailTotal(filtered.length);
    }
  }, [detailDraft, detailFullSet, selectedRoleId, applyDetailFilterToRows]);

  const resetDetailFilters = useCallback(() => {
    detailGridApiRef.current?.discardChanges();
    setDetailDraft(DETAIL_DEFAULTS);
    setDetailFilters(DETAIL_DEFAULTS);
    if (selectedRoleId) {
      setDetailRows(toGridRows(detailFullSet));
      setDetailTotal(detailFullSet.length);
    }
  }, [detailFullSet, selectedRoleId]);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[6fr_4fr]">
        <RoleGrid
          rows={masterRows}
          total={masterTotal}
          selectedId={selectedRoleId}
          onSelect={guardedSelect}
          draftFilters={masterDraft}
          onDraftFilterChange={setMasterDraft}
          onApplyFilters={applyMasterFilters}
          onResetFilters={resetMasterFilters}
          onGridReady={(api) => { masterGridApiRef.current = api; }}
          onDirtyChange={setMasterDirty}
          saving={savingMaster}
          onSave={handleMasterSave}
          onExport={handleMasterExport}
          initialGridRows={initialMasterRows}
          onGridRowsChange={handleMasterGridRowsChange}
        />
        <RolePermissionGrid
          rows={detailRows}
          total={detailTotal}
          selectedRoleId={selectedRoleId}
          selectedRoleCode={selectedRoleCode}
          selectedRoleName={selectedRoleName}
          draftFilters={detailDraft}
          onDraftFilterChange={setDetailDraft}
          onApplyFilters={applyDetailFilters}
          onResetFilters={resetDetailFilters}
          onGridReady={(api) => { detailGridApiRef.current = api; }}
          onDirtyChange={setDetailDirty}
          saving={savingDetail}
          onSave={handleDetailSave}
          onExport={handleDetailExport}
        />
      </div>
      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={detailDirty}
        onSaveAndContinue={async () => {
          detailGridApiRef.current?.discardChanges();
          pendingNav?.();
          setPendingNav(null);
        }}
        onDiscardAndContinue={() => {
          detailGridApiRef.current?.discardChanges();
          pendingNav?.();
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </>
  );
}
