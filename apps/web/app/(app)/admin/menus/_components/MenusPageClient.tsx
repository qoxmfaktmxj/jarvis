"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/MenusPageClient.tsx
 *
 * /admin/menus 클라이언트 오케스트레이터.
 *  - 마스터(menu_item) + 디테일(menu_permission) 그리드 두 개를 vertical stack으로 렌더.
 *  - selectedMenuId 상태를 보유, 마스터 선택 시 listMenuPermissions로 디테일 fetch.
 *  - 디테일 unsaved changes가 있을 때 마스터 선택 변경을 UnsavedChangesDialog로 가드.
 *  - 두 그리드 모두 DataGrid 기반 (Phase B: 자체 <table> 완전 제거).
 *  - 저장 직전 findDuplicateKeys로 중복 코드(마스터: code) 검증.
 *
 * DataGrid onSave 시그니처: (changes: GridChanges<T>) => Promise<GridSaveResult>.
 * 탭 캐시: onGridRowsChange + useTabState로 마스터 행 상태 mirror.
 *
 * URL persistence는 마스터 필터에만 적용.
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
import type { GridChanges, GridSaveResult } from "@/components/grid/types";
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
import { toGridRows, type MenuPermissionGridRow } from "./useMenuPermissionGridState";

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
  kind: string;
  parentCode: string;
  visibility: string;
};

const MASTER_DEFAULTS: MasterFilters = {
  q: "",
  kind: "",
  parentCode: "",
  visibility: "",
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

  // ---- Master rows state ----
  // DataGrid가 자체 useGridState를 가지므로 부모는 rows(서버 fresh)와 initialGridRows(캐시)만 전달.
  // onGridRowsChange로 DataGrid 내부 상태를 mirror해 selectedMenu 계산, export 등에 활용.

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

  // Server-fresh master rows (업데이트 시 DataGrid가 자동 sync via useEffect).
  const [masterRows, setMasterRows] = useState<MenuRow[]>(initialMenus);
  const [masterTotal, setMasterTotal] = useState(initialMenuTotal);

  // Mirror: DataGrid 내부 rows 상태 → 부모가 selectedMenu / export에서 참조.
  const [masterGridRows, setMasterGridRows] = useState<GridRow<MenuRow>[]>(
    initialMasterRows ?? [],
  );
  const handleMasterGridRowsChange = useCallback(
    (rows: GridRow<MenuRow>[]) => {
      setMasterGridRows(rows);
      setMasterRowsCache(rows);
    },
    [setMasterRowsCache],
  );

  // Master dirty count (onDirtyChange로 받음).
  const [masterDirty, setMasterDirty] = useState(0);
  // Detail dirty count.
  const [detailDirty, setDetailDirty] = useState(0);

  // DataGrid API refs — discardChanges 노출.
  const masterGridApiRef = useRef<{ discardChanges: () => void } | null>(null);
  const detailGridApiRef = useRef<{ discardChanges: () => void } | null>(null);

  // ---- Detail rows state ----
  const [detailRows, setDetailRows] = useState<MenuPermissionGridRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailFullSet, setDetailFullSet] = useState<MenuPermissionRow[]>([]);

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  // URL-synced master filters (committed) + draft for input typing.
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

  // Tab dirty: either grid dirty.
  useTabDirty(masterDirty > 0 || detailDirty > 0);

  // Tab close save handler.
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
          kind:
            filters.kind === "menu" || filters.kind === "action"
              ? filters.kind
              : undefined,
          parentCode: filters.parentCode || undefined,
          visibility:
            filters.visibility === "visible" || filters.visibility === "hidden"
              ? filters.visibility
              : undefined,
          page: 1,
          limit: MASTER_LIMIT,
        });
        if (!("error" in res)) {
          // DataGrid가 rows prop 변경을 감지해 내부 reset을 자동 처리.
          setMasterRows(res.rows);
          setMasterTotal(res.total);
        }
      });
    },
    [],
  );

  // ---- Detail reload ----
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
        setDetailRows([]);
        setDetailTotal(0);
        setDetailFullSet([]);
        return;
      }
      startDetailReload(async () => {
        const res = await listMenuPermissions({ menuId });
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

  // selected menu meta (for detail header + export filename)
  const selectedMenu = useMemo(
    () => masterGridRows.find((r) => r.data.id === selectedMenuId)?.data ?? null,
    [masterGridRows, selectedMenuId],
  );
  const selectedMenuCode = selectedMenu?.code ?? null;
  const selectedMenuLabel = selectedMenu?.label ?? null;

  // ---- Master row selection (gated by detail dirty state) ----
  const guardedSelect = useCallback(
    (id: string | null) => {
      if (id === null) return;
      const switchTo = () => {
        setSelectedMenuId(id);
        setDetailDraft(DETAIL_DEFAULTS);
        setDetailFilters(DETAIL_DEFAULTS);
        reloadDetail(id, DETAIL_DEFAULTS);
      };
      if (detailDirty > 0 && id !== selectedMenuId) {
        setPendingNav(() => switchTo);
      } else {
        switchTo();
      }
    },
    [detailDirty, reloadDetail, selectedMenuId],
  );

  // ---- Master save — DataGrid onSave 시그니처로 wrapping ----
  const handleMasterSave = useCallback(
    async (changes: GridChanges<MenuRow>): Promise<GridSaveResult> => {
      // duplicate 검사: creates + updates의 live rows (deletes 제외)
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
          const result = await saveMenus({
            creates: changes.creates,
            updates: changes.updates,
            deletes: changes.deletes,
          });
          if (result.ok) {
            reloadMaster(masterUrlFilters);
            if (selectedMenuId && changes.deletes.includes(selectedMenuId)) {
              setSelectedMenuId(null);
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
            resolve({
              ok: false,
              errors: result.errors,
            });
          }
        });
      });
    },
    [masterGridRows, masterUrlFilters, reloadMaster, selectedMenuId, t],
  );

  // ---- Detail save — DataGrid onSave 시그니처로 wrapping ----
  const handleDetailSave = useCallback(
    async (changes: GridChanges<MenuPermissionGridRow>): Promise<GridSaveResult> => {
      if (!selectedMenuId) return { ok: false };

      // assigned diff는 DataGrid changes.updates에서 추출.
      // DataGrid의 onSave changes.updates는 { id, patch } 형태이므로
      // 현재 detailRows 상태에서 original vs current 비교 필요.
      // 단순하게: detailRows 중 dirty인 행에서 assigned 변화 추출.
      // (DataGrid가 changes.updates를 넘겨주므로 그걸 직접 사용.)
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
          const result = await saveMenuPermissions({
            menuId: selectedMenuId,
            assigned,
            removed,
          });
          if (result.ok) {
            reloadDetail(selectedMenuId, detailFilters);
            reloadMaster(masterUrlFilters);
            resolve({ ok: true });
          } else {
            toast({
              variant: "destructive",
              title: "저장 실패",
              description:
                result.errors?.map((e) => e.message).join("\n") ?? t("saveError"),
            });
            resolve({
              ok: false,
              errors: result.errors,
            });
          }
        });
      });
    },
    [selectedMenuId, detailRows, detailFilters, reloadDetail, reloadMaster, masterUrlFilters, t],
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
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string")
          return v;
        return String(v);
      },
    });
  }, [masterGridRows, tMaster, t]);

  const handleDetailExport = useCallback(() => {
    if (!selectedMenuId) return;
    if (detailRows.length === 0) {
      toast({ title: "안내", description: t("noDataToExport") });
      return;
    }
    const columns = getMenuPermissionExportColumns(tDetail);
    const filename = `메뉴_권한_${selectedMenuCode ?? "menu"}`;
    void exportToExcel<MenuPermissionGridRow, (typeof columns)[number]>({
      filename,
      sheetName: tDetail("title"),
      columns,
      rows: detailRows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof MenuPermissionGridRow];
        if (col.key === "assigned") {
          return v ? tDetail("assignedY") : tDetail("assignedN");
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string")
          return v;
        return String(v);
      },
    });
  }, [detailRows, selectedMenuId, selectedMenuCode, tDetail, t]);

  // ---- Master filter apply / reset ----
  const applyMasterFilters = useCallback(() => {
    masterGridApiRef.current?.discardChanges();
    reloadMaster(masterDraft);
    setMasterUrlValues({
      q: masterDraft.q,
      kind: masterDraft.kind,
      parentCode: masterDraft.parentCode,
      visibility: masterDraft.visibility,
    });
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
    if (selectedMenuId) {
      const filtered = applyDetailFilterToRows(detailFullSet, detailDraft);
      setDetailRows(toGridRows(filtered));
      setDetailTotal(filtered.length);
    }
  }, [detailDraft, detailFullSet, selectedMenuId, applyDetailFilterToRows]);

  const resetDetailFilters = useCallback(() => {
    detailGridApiRef.current?.discardChanges();
    setDetailDraft(DETAIL_DEFAULTS);
    setDetailFilters(DETAIL_DEFAULTS);
    if (selectedMenuId) {
      setDetailRows(toGridRows(detailFullSet));
      setDetailTotal(detailFullSet.length);
    }
  }, [detailFullSet, selectedMenuId]);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[7fr_3fr]">
        <MenuGrid
          rows={masterRows}
          total={masterTotal}
          selectedId={selectedMenuId}
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
          parentOptions={parentOptions}
          iconOptions={iconOptions}
          initialGridRows={initialMasterRows}
          onGridRowsChange={handleMasterGridRowsChange}
        />
        <MenuPermissionGrid
          rows={detailRows}
          total={detailTotal}
          selectedMenuId={selectedMenuId}
          selectedMenuCode={selectedMenuCode}
          selectedMenuLabel={selectedMenuLabel}
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
          // detail 저장은 DataGrid 내부 onSave를 직접 트리거할 수 없으므로
          // detailGridApiRef로 discardChanges 호출 후 pendingNav 실행.
          // (UnsavedChangesDialog는 dirty count가 0이 아닐 때만 표시)
          // 단순 처리: discard 후 이동 (미저장 변경 포기).
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
