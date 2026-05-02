"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenusPageClient.tsx
 *
 * /admin/menus 클라이언트 오케스트레이터.
 *  - 마스터(menu_item) + 디테일(menu_permission) 그리드 두 개를 vertical stack으로 렌더.
 *  - selectedMenuId 상태를 보유, 마스터 선택 시 listMenuPermissions로 디테일 fetch.
 *  - 디테일 unsaved changes가 있을 때 마스터 선택 변경을 UnsavedChangesDialog로 가드.
 *  - 두 그리드 모두 useGridState 기반.
 *  - 저장 직전 findDuplicateKeys로 중복 코드(마스터: code) 검증.
 *
 * URL persistence는 마스터 필터에만 적용. 디테일 필터는 메뉴별로 의미가 달라
 * URL에 저장하지 않는다 (선택 변경 시 자연 초기화).
 *
 * 패턴 출처: apps/web/app/(app)/admin/codes/_components/CodesPageClient.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import {
  type GridRow,
  overlayGridRows,
  rowsToBatch,
} from "@/components/grid/useGridState";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { useTabDirty } from "@/components/layout/tabs/useTabDirty";
import { useTabContext } from "@/components/layout/tabs/TabContext";
import { pathnameToTabKey } from "@/components/layout/tabs/tab-key";
import type {
  MenuRow,
  MenuPermissionRow,
} from "@jarvis/shared/validation/admin/menu";
import {
  listMenus,
  listMenuPermissions,
  saveMenus,
  saveMenuPermissions,
} from "../actions";
import { MenuGrid, getMenuExportColumns } from "./MenuGrid";
import {
  MenuPermissionGrid,
  getMenuPermissionExportColumns,
} from "./MenuPermissionGrid";
import { makeBlankMenu, useMenuGridState } from "./useMenuGridState";
import {
  toGridRows,
  useMenuPermissionGridState,
  type MenuPermissionGridRow,
} from "./useMenuPermissionGridState";

const MASTER_LIMIT = 200;

type ParentOption = { code: string; label: string };
type IconOption = { value: string; label: string };

type Props = {
  initialMenus: MenuRow[];
  initialMenuTotal: number;
  parentOptions: ParentOption[];
  iconOptions: IconOption[];
};

type MasterFilters = {
  q: string;
  qLabel: string;
  kind: string;
  parentCode: string;
};

const MASTER_DEFAULTS: MasterFilters = {
  q: "",
  qLabel: "",
  kind: "",
  parentCode: "",
};

type DetailFilters = {
  q: string;
};

const DETAIL_DEFAULTS: DetailFilters = { q: "" };

export function MenusPageClient({
  initialMenus,
  initialMenuTotal,
  parentOptions,
  iconOptions,
}: Props) {
  const t = useTranslations("Admin.Menus");
  const tMaster = useTranslations("Admin.Menus.masterSection");
  const tDetail = useTranslations("Admin.Menus.detailSection");

  // Master grid rows cache — survives tab switches via sessionStorage. Detail
  // grid is per-selected-menu and re-fetched on selection, so it is not cached.
  const [masterRowsCache, setMasterRowsCache] = useTabState<GridRow<MenuRow>[]>(
    "admin.menus.masterGridRows",
    [],
  );
  const masterTabKeyRef = useRef<string | null>(null);
  const masterPathname = usePathname() ?? "/admin/menus";
  const masterTabKey = pathnameToTabKey(masterPathname);
  const initialMasterRows = useMemo(() => {
    if (masterTabKeyRef.current === masterTabKey) return undefined;
    masterTabKeyRef.current = masterTabKey;
    return overlayGridRows(
      initialMenus,
      masterRowsCache.length > 0 ? masterRowsCache : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTabKey]);

  const masterGrid = useMenuGridState(initialMenus, {
    initialRows: initialMasterRows,
    onRowsChange: setMasterRowsCache,
  });
  const detailGrid = useMenuPermissionGridState([]);

  const [masterTotal, setMasterTotal] = useState(initialMenuTotal);
  const [detailTotal, setDetailTotal] = useState(0);

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  // URL-synced master filters (committed) + draft for input typing.
  const {
    values: masterUrlFilters,
    setValue: setMasterUrlFilter,
    reset: resetMasterUrl,
  } = useUrlFilters<MasterFilters>({ defaults: MASTER_DEFAULTS });
  const [masterDraft, setMasterDraft] = useState<MasterFilters>(masterUrlFilters);
  // Sync draft when URL changes externally (back/forward, refresh).
  useEffect(() => {
    setMasterDraft(masterUrlFilters);
  }, [masterUrlFilters]);

  const [detailDraft, setDetailDraft] = useState<DetailFilters>(DETAIL_DEFAULTS);
  const [detailFilters, setDetailFilters] = useState<DetailFilters>(DETAIL_DEFAULTS);
  const [detailFullSet, setDetailFullSet] = useState<MenuPermissionRow[]>([]);

  const [savingMaster, startMasterSave] = useTransition();
  const [savingDetail, startDetailSave] = useTransition();
  const [, startMasterReload] = useTransition();
  const [, startDetailReload] = useTransition();

  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  // Tab dirty marker reflects EITHER master or detail dirty so the user sees
  // the unsaved-changes indicator regardless of which grid they edited.
  useTabDirty(masterGrid.dirtyCount > 0 || detailGrid.dirtyCount > 0);

  // Register a save handler for the tab close dialog. We save master only —
  // detail save requires a selectedMenuId + diff logic that is harder to
  // serialize from a stale ref; users with detail edits will still be prompted
  // by the existing UnsavedChangesDialog when switching master rows.
  const ctx = useTabContext();
  const masterRowsCacheRef = useRef(masterRowsCache);
  masterRowsCacheRef.current = masterRowsCache;
  useEffect(() => {
    return ctx.registerSaveHandler(masterTabKey, async () => {
      const changes = rowsToBatch(masterRowsCacheRef.current);
      if (
        changes.creates.length === 0 &&
        changes.updates.length === 0 &&
        changes.deletes.length === 0
      ) {
        return { ok: true };
      }
      // Mirror handleMasterSave's dedup guard so the close-dialog save matches
      // the explicit save button's validation.
      const liveRows = masterRowsCacheRef.current
        .filter((r) => r.state !== "deleted")
        .map((r) => r.data);
      const dups = findDuplicateKeys(liveRows, ["code"]);
      if (dups.length > 0) {
        return { ok: false };
      }
      const result = await saveMenus({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      return { ok: result.ok };
    });
  }, [ctx, masterTabKey]);

  // ---- Master reload ----
  const reloadMaster = useCallback(
    (filters: MasterFilters) => {
      startMasterReload(async () => {
        const res = await listMenus({
          q: filters.q || undefined,
          qLabel: filters.qLabel || undefined,
          kind:
            filters.kind === "menu" || filters.kind === "action"
              ? filters.kind
              : undefined,
          parentCode: filters.parentCode || undefined,
          page: 1,
          limit: MASTER_LIMIT,
        });
        if (!("error" in res)) {
          masterGrid.reset(res.rows);
          setMasterTotal(res.total);
        }
      });
    },
    [masterGrid],
  );

  // ---- Detail reload (loads full permission set, then applies client-side q filter) ----
  const applyDetailFilterToRows = useCallback(
    (rows: MenuPermissionRow[], filters: DetailFilters) => {
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
    (menuId: string | null, filters: DetailFilters) => {
      if (!menuId) {
        detailGrid.reset([]);
        setDetailTotal(0);
        setDetailFullSet([]);
        return;
      }
      startDetailReload(async () => {
        const res = await listMenuPermissions({ menuId });
        if (!("error" in res)) {
          setDetailFullSet(res.rows);
          const filtered = applyDetailFilterToRows(res.rows, filters);
          detailGrid.reset(toGridRows(filtered));
          setDetailTotal(filtered.length);
        } else {
          detailGrid.reset([]);
          setDetailTotal(0);
          setDetailFullSet([]);
        }
      });
    },
    [detailGrid, applyDetailFilterToRows],
  );

  // selected menu meta (for detail header + export filename)
  const selectedMenu = useMemo(
    () => masterGrid.rows.find((r) => r.data.id === selectedMenuId)?.data ?? null,
    [masterGrid.rows, selectedMenuId],
  );
  const selectedMenuCode = selectedMenu?.code ?? null;
  const selectedMenuLabel = selectedMenu?.label ?? null;

  // ---- Master row selection (gated by detail dirty state) ----
  const guardedSelect = useCallback(
    (id: string) => {
      const switchTo = () => {
        setSelectedMenuId(id);
        setDetailDraft(DETAIL_DEFAULTS);
        setDetailFilters(DETAIL_DEFAULTS);
        reloadDetail(id, DETAIL_DEFAULTS);
      };
      if (detailGrid.dirtyCount > 0 && id !== selectedMenuId) {
        setPendingNav(() => switchTo);
      } else {
        switchTo();
      }
    },
    [detailGrid.dirtyCount, reloadDetail, selectedMenuId],
  );

  // ---- Master save ----
  const handleMasterSave = useCallback(() => {
    const liveRows = masterGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    const dups = findDuplicateKeys(liveRows, ["code"]);
    if (dups.length > 0) {
      toast({
        variant: "destructive",
        title: "입력 확인",
        description: t("duplicates", { codes: dups.join(", ") }),
      });
      return;
    }
    startMasterSave(async () => {
      const changes = masterGrid.toBatch();
      const result = await saveMenus({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        reloadMaster(masterUrlFilters);
        if (selectedMenuId && changes.deletes.includes(selectedMenuId)) {
          setSelectedMenuId(null);
          detailGrid.reset([]);
          setDetailTotal(0);
          setDetailFullSet([]);
        }
      } else {
        toast({
          variant: "destructive",
          title: "저장 실패",
          description:
            result.errors?.map((e) => e.message).join("\n") ?? t("saveError"),
        });
      }
    });
  }, [
    masterGrid,
    masterUrlFilters,
    reloadMaster,
    selectedMenuId,
    detailGrid,
    t,
  ]);

  // ---- Detail save ----
  const handleDetailSave = useCallback(() => {
    if (!selectedMenuId) return;
    startDetailSave(async () => {
      // Build add/remove diff from dirty rows (state === "dirty"): the only
      // editable column is `assigned`; original.assigned vs data.assigned.
      const assigned: string[] = [];
      const removed: string[] = [];
      for (const r of detailGrid.rows) {
        if (r.state !== "dirty") continue;
        const wasAssigned = r.original?.assigned ?? false;
        const isAssigned = r.data.assigned;
        if (!wasAssigned && isAssigned) assigned.push(r.data.permissionId);
        else if (wasAssigned && !isAssigned) removed.push(r.data.permissionId);
      }
      if (assigned.length === 0 && removed.length === 0) return;
      const result = await saveMenuPermissions({
        menuId: selectedMenuId,
        assigned,
        removed,
      });
      if (result.ok) {
        reloadDetail(selectedMenuId, detailFilters);
        // master permCnt 갱신을 위해 master도 reload
        reloadMaster(masterUrlFilters);
      } else {
        toast({
          variant: "destructive",
          title: "저장 실패",
          description:
            result.errors?.map((e) => e.message).join("\n") ?? t("saveError"),
        });
      }
    });
  }, [
    detailGrid,
    selectedMenuId,
    detailFilters,
    reloadDetail,
    reloadMaster,
    masterUrlFilters,
    t,
  ]);

  // ---- Insert / Copy (master only) ----
  const handleMasterInsert = useCallback(() => {
    masterGrid.insertBlank(makeBlankMenu());
  }, [masterGrid]);

  const handleMasterCopy = useCallback(() => {
    if (!selectedMenuId) {
      toast({
        variant: "destructive",
        title: "입력 확인",
        description: tDetail("emptyMaster"),
      });
      return;
    }
    masterGrid.duplicate(selectedMenuId, (clone) => ({
      ...clone,
      id: crypto.randomUUID(),
      code: "",
      permCnt: 0,
    }));
  }, [masterGrid, selectedMenuId, tDetail]);

  // ---- Excel export ----
  const handleMasterExport = useCallback(() => {
    const rows = masterGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    if (rows.length === 0) {
      toast({
        title: "안내",
        description: t("noDataToExport"),
      });
      return;
    }
    const columns = getMenuExportColumns(tMaster);
    void exportToExcel<MenuRow, (typeof columns)[number]>({
      filename: "메뉴_마스터",
      sheetName: tMaster("title"),
      columns,
      rows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof MenuRow];
        if (col.key === "kind") {
          if (v === "menu") return tMaster("kind.menu");
          if (v === "action") return tMaster("kind.action");
          return v === null || v === undefined ? "" : String(v);
        }
        if (col.key === "isVisible") {
          return v ? tMaster("filter.visibleY") : tMaster("filter.visibleN");
        }
        if (v === null || v === undefined) return "";
        if (
          typeof v === "boolean" ||
          typeof v === "number" ||
          typeof v === "string"
        )
          return v;
        return String(v);
      },
    });
  }, [masterGrid.rows, tMaster, t]);

  const handleDetailExport = useCallback(() => {
    if (!selectedMenuId) return;
    const rows = detailGrid.rows.map((r) => r.data);
    if (rows.length === 0) {
      toast({
        title: "안내",
        description: t("noDataToExport"),
      });
      return;
    }
    const columns = getMenuPermissionExportColumns(tDetail);
    const filename = `메뉴_권한_${selectedMenuCode ?? "menu"}`;
    void exportToExcel<MenuPermissionGridRow, (typeof columns)[number]>({
      filename,
      sheetName: tDetail("title"),
      columns,
      rows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof MenuPermissionGridRow];
        if (col.key === "assigned") {
          return v ? tDetail("assignedY") : tDetail("assignedN");
        }
        if (v === null || v === undefined) return "";
        if (
          typeof v === "boolean" ||
          typeof v === "number" ||
          typeof v === "string"
        )
          return v;
        return String(v);
      },
    });
  }, [detailGrid.rows, selectedMenuId, selectedMenuCode, tDetail, t]);

  // ---- Master filter apply / reset ----
  const applyMasterFilters = useCallback(() => {
    setMasterUrlFilter("q", masterDraft.q);
    setMasterUrlFilter("qLabel", masterDraft.qLabel);
    setMasterUrlFilter("kind", masterDraft.kind);
    setMasterUrlFilter("parentCode", masterDraft.parentCode);
    reloadMaster(masterDraft);
  }, [masterDraft, reloadMaster, setMasterUrlFilter]);

  const resetMasterFilters = useCallback(() => {
    resetMasterUrl();
    setMasterDraft(MASTER_DEFAULTS);
    reloadMaster(MASTER_DEFAULTS);
  }, [reloadMaster, resetMasterUrl]);

  // ---- Detail filter apply / reset (client-side filter over full set) ----
  const applyDetailFilters = useCallback(() => {
    setDetailFilters(detailDraft);
    if (selectedMenuId) {
      const filtered = applyDetailFilterToRows(detailFullSet, detailDraft);
      detailGrid.reset(toGridRows(filtered));
      setDetailTotal(filtered.length);
    }
  }, [detailDraft, detailFullSet, detailGrid, selectedMenuId, applyDetailFilterToRows]);

  const resetDetailFilters = useCallback(() => {
    setDetailDraft(DETAIL_DEFAULTS);
    setDetailFilters(DETAIL_DEFAULTS);
    if (selectedMenuId) {
      detailGrid.reset(toGridRows(detailFullSet));
      setDetailTotal(detailFullSet.length);
    }
  }, [detailFullSet, detailGrid, selectedMenuId]);

  return (
    <>
      <div className="space-y-6">
        <MenuGrid
          grid={masterGrid}
          total={masterTotal}
          selectedId={selectedMenuId}
          onSelect={guardedSelect}
          draftFilters={masterDraft}
          onDraftFilterChange={setMasterDraft}
          onApplyFilters={applyMasterFilters}
          onResetFilters={resetMasterFilters}
          saving={savingMaster}
          onInsert={handleMasterInsert}
          onCopy={handleMasterCopy}
          onSave={handleMasterSave}
          onExport={handleMasterExport}
          parentOptions={parentOptions}
          iconOptions={iconOptions}
        />
        <MenuPermissionGrid
          grid={detailGrid}
          total={detailTotal}
          selectedMenuId={selectedMenuId}
          selectedMenuCode={selectedMenuCode}
          selectedMenuLabel={selectedMenuLabel}
          draftFilters={detailDraft}
          onDraftFilterChange={setDetailDraft}
          onApplyFilters={applyDetailFilters}
          onResetFilters={resetDetailFilters}
          saving={savingDetail}
          onSave={handleDetailSave}
          onExport={handleDetailExport}
        />
      </div>
      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={detailGrid.dirtyCount}
        onSaveAndContinue={async () => {
          handleDetailSave();
          pendingNav?.();
          setPendingNav(null);
        }}
        onDiscardAndContinue={() => {
          detailGrid.reset(detailGrid.rows.map((r) => r.data));
          pendingNav?.();
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </>
  );
}
