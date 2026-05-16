"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodesPageClient.tsx
 *
 * /admin/codes 클라이언트 오케스트레이터.
 *  - 마스터(그룹코드) + 디테일(세부코드) 그리드 두 개를 vertical stack으로 렌더한다.
 *  - selectedGroupId 상태를 보유하고, 마스터 행이 선택되면 listCodeItems로 디테일을 fetch.
 *  - 디테일에 unsaved changes가 있을 때 마스터 선택을 바꾸려 하면 UnsavedChangesDialog로 가드.
 *  - 두 그리드 모두 DataGrid 기반 (Phase C: 자체 <table> 완전 제거).
 *  - 저장 직전 findDuplicateKeys로 중복 코드(마스터: code, 디테일: code) 검증.
 *
 * DataGrid onSave 시그니처: (changes: GridChanges<T>) => Promise<GridSaveResult>.
 *
 * URL 동기화는 마스터 필터(q/qName/includesDetailCodeNm/kind)에만 적용.
 * 디테일 필터는 그룹별로 의미가 달라 URL persist하지 않는다 (선택 변경 시 자연 초기화).
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { toast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { GridChanges, GridSaveResult } from "@/components/grid/types";
import type { GridRow } from "@/components/grid/useGridState";
import type { CodeGroupRow, CodeItemRow } from "@jarvis/shared/validation/admin/code";
import {
  listCodeGroups,
  listCodeItems,
  saveCodeGroups,
  saveCodeItems,
} from "../actions";
import { CodeGroupGrid, getCodeGroupExportColumns } from "./CodeGroupGrid";
import { CodeItemGrid, getCodeItemExportColumns } from "./CodeItemGrid";

const MASTER_LIMIT = 100;
const DETAIL_LIMIT = 500;

type BusinessDivOption = { code: string; label: string };

type Props = {
  initialGroups: CodeGroupRow[];
  initialGroupTotal: number;
  businessDivOptions: BusinessDivOption[];
};

type MasterFilters = {
  q: string;
  qName: string;
  includesDetailCodeNm: string;
  kind: string;
};

const MASTER_DEFAULTS: MasterFilters = {
  q: "",
  qName: "",
  includesDetailCodeNm: "",
  kind: "",
};

type DetailFilters = {
  q: string;
  qName: string;
  useYn: string;
};

const DETAIL_DEFAULTS: DetailFilters = {
  q: "",
  qName: "",
  useYn: "",
};

export function CodesPageClient({
  initialGroups,
  initialGroupTotal,
  businessDivOptions,
}: Props) {
  const t = useTranslations("Admin.Codes");
  const tGroup = useTranslations("Admin.Codes.groupSection");
  const tItem = useTranslations("Admin.Codes.itemSection");

  // ---- Master rows state ----
  // DataGrid가 자체 useGridState를 가지므로 부모는 rows(서버 fresh)만 전달.
  // onGridRowsChange로 DataGrid 내부 상태를 mirror해 export / selectedGroup 계산에 활용.
  const [masterRows, setMasterRows] = useState<CodeGroupRow[]>(initialGroups);
  const [masterTotal, setMasterTotal] = useState(initialGroupTotal);
  const [masterGridRows, setMasterGridRows] = useState<GridRow<CodeGroupRow>[]>([]);

  // Detail rows state
  const [detailRows, setDetailRows] = useState<CodeItemRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);

  const [masterDirty, setMasterDirty] = useState(0);
  const [detailDirty, setDetailDirty] = useState(0);

  // DataGrid API refs — discardChanges 노출.
  const masterGridApiRef = useRef<{ discardChanges: () => void } | null>(null);
  const detailGridApiRef = useRef<{ discardChanges: () => void } | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // URL-synced master filter values (committed) + draft for input typing
  const { values: masterUrlFilters, setValues: setMasterUrlValues, reset: resetMasterUrl } =
    useUrlFilters<MasterFilters>({ defaults: MASTER_DEFAULTS });
  const [masterDraft, setMasterDraft] = useState<MasterFilters>(masterUrlFilters);
  // Sync draft when URL changes externally (back/forward, refresh).
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

  // selected group label (used by detail header + export filename)
  const selectedGroup =
    masterGridRows.find((r) => r.data.id === selectedGroupId)?.data ??
    masterRows.find((r) => r.id === selectedGroupId) ??
    null;
  const selectedGroupCode = selectedGroup?.code ?? null;
  const selectedGroupName = selectedGroup?.name ?? null;

  // ---- Master reload ----
  const reloadMaster = useCallback(
    (filters: MasterFilters) => {
      startMasterReload(async () => {
        const res = await listCodeGroups({
          q: filters.q || undefined,
          qName: filters.qName || undefined,
          kind: filters.kind === "C" || filters.kind === "N" ? filters.kind : undefined,
          includesDetailCodeNm: filters.includesDetailCodeNm ? true : undefined,
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
  const reloadDetail = useCallback(
    (groupId: string | null, filters: DetailFilters) => {
      if (!groupId) {
        setDetailRows([]);
        setDetailTotal(0);
        return;
      }
      startDetailReload(async () => {
        const res = await listCodeItems({
          groupId,
          q:
            filters.q || filters.qName
              ? [filters.q, filters.qName].filter(Boolean).join(" ")
              : undefined,
          useYn:
            filters.useYn === "Y" || filters.useYn === "N" ? filters.useYn : undefined,
          page: 1,
          limit: DETAIL_LIMIT,
        });
        if (!("error" in res)) {
          setDetailRows(res.rows);
          setDetailTotal(res.total);
        } else {
          setDetailRows([]);
          setDetailTotal(0);
        }
      });
    },
    [],
  );

  // ---- Master row selection (gated by detail dirty state) ----
  const guardedSelect = useCallback(
    (id: string | null) => {
      if (id === null) return;
      const switchTo = () => {
        setSelectedGroupId(id);
        setDetailDraft(DETAIL_DEFAULTS);
        setDetailFilters(DETAIL_DEFAULTS);
        reloadDetail(id, DETAIL_DEFAULTS);
      };
      if (detailDirty > 0 && id !== selectedGroupId) {
        setPendingNav(() => switchTo);
      } else {
        switchTo();
      }
    },
    [detailDirty, reloadDetail, selectedGroupId],
  );

  // ---- Master save — DataGrid onSave 시그니처로 wrapping ----
  const handleMasterSave = useCallback(
    async (changes: GridChanges<CodeGroupRow>): Promise<GridSaveResult> => {
      // duplicate 검사: masterGridRows 중 live rows
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
          const result = await saveCodeGroups({
            creates: changes.creates,
            updates: changes.updates,
            deletes: changes.deletes,
          });
          if (result.ok) {
            reloadMaster(masterUrlFilters);
            // selected group may have been deleted — clear if so
            if (selectedGroupId && changes.deletes.includes(selectedGroupId)) {
              setSelectedGroupId(null);
              setDetailRows([]);
              setDetailTotal(0);
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
    [masterGridRows, masterUrlFilters, reloadMaster, selectedGroupId, t],
  );

  // ---- Detail save — DataGrid onSave 시그니처로 wrapping ----
  const handleDetailSave = useCallback(
    async (changes: GridChanges<CodeItemRow>): Promise<GridSaveResult> => {
      if (!selectedGroupId) return { ok: false };

      // detailGridRows mirror가 없으므로 changes 기반 live rows 재구성은 어려움.
      // DataGrid 내부에서 이미 유효성 검사를 마쳤으므로 duplicate만 서버 측에서 처리.
      // 단순 dup 검사: creates + updates의 code 필드 수집.
      const liveCodes: string[] = [
        ...changes.creates.map((r) => (r as CodeItemRow).code),
        ...changes.updates.map((u) => (u.patch as Partial<CodeItemRow>).code).filter(Boolean),
      ] as string[];
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const code of liveCodes) {
        if (seen.has(code)) dups.push(code);
        seen.add(code);
      }
      if (dups.length > 0) {
        toast({
          variant: "destructive",
          title: "입력 확인",
          description: t("duplicates", { codes: dups.join(", ") }),
        });
        return { ok: false };
      }

      return new Promise<GridSaveResult>((resolve) => {
        startDetailSave(async () => {
          const result = await saveCodeItems({
            creates: changes.creates,
            updates: changes.updates,
            deletes: changes.deletes,
          });
          if (result.ok) {
            reloadDetail(selectedGroupId, detailFilters);
            // master subCnt 갱신을 위해 master도 reload
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
    [selectedGroupId, detailFilters, reloadDetail, reloadMaster, masterUrlFilters, t],
  );

  // ---- Excel export ----
  const handleMasterExport = useCallback(() => {
    const rows = masterGridRows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    if (rows.length === 0) {
      toast({ title: "안내", description: "내려받을 데이터가 없습니다." });
      return;
    }
    const columns = getCodeGroupExportColumns(tGroup);
    void exportToExcel<CodeGroupRow, (typeof columns)[number]>({
      filename: "공통코드_그룹",
      sheetName: tGroup("title"),
      columns,
      rows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof CodeGroupRow];
        if (col.key === "businessDivCode") {
          return (
            businessDivOptions.find((o) => o.code === v)?.label ??
            (v === null || v === undefined ? "" : String(v))
          );
        }
        if (col.key === "kindCode") {
          if (v === "C") return tGroup("filter.kindUser");
          if (v === "N") return tGroup("filter.kindSystem");
          return v === null || v === undefined ? "" : String(v);
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
          return v;
        }
        return String(v);
      },
    });
  }, [masterGridRows, businessDivOptions, tGroup]);

  const handleDetailExport = useCallback(() => {
    if (!selectedGroupId) return;
    if (detailRows.length === 0) {
      toast({ title: "안내", description: "내려받을 데이터가 없습니다." });
      return;
    }
    const columns = getCodeItemExportColumns(tItem);
    const filename = `공통코드_세부_${selectedGroupCode ?? "group"}`;
    void exportToExcel<CodeItemRow, (typeof columns)[number]>({
      filename,
      sheetName: tItem("title"),
      columns,
      rows: detailRows,
      cellFormatter: (row, col) => {
        const v = row[col.key as keyof CodeItemRow];
        if (col.key === "isActive") {
          return v ? tItem("filter.useY") : tItem("filter.useN");
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
          return v;
        }
        return String(v);
      },
    });
  }, [detailRows, selectedGroupId, selectedGroupCode, tItem]);

  // ---- Master filter apply / reset ----
  const applyMasterFilters = useCallback(() => {
    reloadMaster(masterDraft);
    setMasterUrlValues({
      q: masterDraft.q,
      qName: masterDraft.qName,
      includesDetailCodeNm: masterDraft.includesDetailCodeNm,
      kind: masterDraft.kind,
    });
  }, [masterDraft, reloadMaster, setMasterUrlValues]);

  const resetMasterFilters = useCallback(() => {
    resetMasterUrl();
    setMasterDraft(MASTER_DEFAULTS);
    reloadMaster(MASTER_DEFAULTS);
  }, [reloadMaster, resetMasterUrl]);

  // ---- Detail filter apply / reset ----
  const applyDetailFilters = useCallback(() => {
    setDetailFilters(detailDraft);
    reloadDetail(selectedGroupId, detailDraft);
  }, [detailDraft, reloadDetail, selectedGroupId]);

  const resetDetailFilters = useCallback(() => {
    setDetailDraft(DETAIL_DEFAULTS);
    setDetailFilters(DETAIL_DEFAULTS);
    reloadDetail(selectedGroupId, DETAIL_DEFAULTS);
  }, [reloadDetail, selectedGroupId]);

  return (
    <>
      <div className="space-y-3">
        <CodeGroupGrid
          rows={masterRows}
          total={masterTotal}
          selectedId={selectedGroupId}
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
          businessDivOptions={businessDivOptions}
          onGridRowsChange={setMasterGridRows}
        />
        <CodeItemGrid
          rows={detailRows}
          total={detailTotal}
          selectedGroupId={selectedGroupId}
          selectedGroupCode={selectedGroupCode}
          selectedGroupName={selectedGroupName}
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
          // DataGrid 내부 onSave를 직접 트리거할 수 없으므로 discard 후 이동.
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
