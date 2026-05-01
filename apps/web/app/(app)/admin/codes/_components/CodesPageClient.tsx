"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/CodesPageClient.tsx
 *
 * /admin/codes 클라이언트 오케스트레이터.
 *  - 마스터(그룹코드) + 디테일(세부코드) 그리드 두 개를 vertical stack으로 렌더한다.
 *  - selectedGroupId 상태를 보유하고, 마스터 행이 선택되면 listCodeItems로 디테일을 fetch.
 *  - 디테일에 unsaved changes가 있을 때 마스터 선택을 바꾸려 하면 UnsavedChangesDialog로 가드.
 *  - 두 그리드 모두 useGridState 기반(공유 빌딩블록 재사용).
 *  - 저장 직전 findDuplicateKeys로 중복 코드(마스터: code, 디테일: code) 검증.
 *
 * URL 동기화는 마스터 필터(q/qName/includesDetailCodeNm/kind)에만 적용.
 * 디테일 필터는 그룹별로 의미가 달라 URL persist하지 않는다 (선택 변경 시 자연 초기화).
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { CodeGroupRow, CodeItemRow } from "@jarvis/shared/validation/admin/code";
import {
  listCodeGroups,
  listCodeItems,
  saveCodeGroups,
  saveCodeItems,
} from "../actions";
import { CodeGroupGrid, getCodeGroupExportColumns } from "./CodeGroupGrid";
import { CodeItemGrid, getCodeItemExportColumns } from "./CodeItemGrid";
import {
  makeBlankCodeGroup,
  useCodeGroupGridState,
} from "./useCodeGroupGridState";
import {
  makeBlankCodeItem,
  useCodeItemGridState,
} from "./useCodeItemGridState";

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
  const masterGrid = useCodeGroupGridState(initialGroups);
  const detailGrid = useCodeItemGridState([]);

  const [masterTotal, setMasterTotal] = useState(initialGroupTotal);
  const [detailTotal, setDetailTotal] = useState(0);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // URL-synced master filter values (committed) + draft for input typing
  const { values: masterUrlFilters, setValue: setMasterUrlFilter, reset: resetMasterUrl } =
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

  // ---- Master reload ----
  const reloadMaster = useCallback(
    (filters: MasterFilters) => {
      startMasterReload(async () => {
        const res = await listCodeGroups({
          // q matches code/description; qName matches name. Independent filters.
          q: filters.q || undefined,
          qName: filters.qName || undefined,
          kind: filters.kind === "C" || filters.kind === "N" ? filters.kind : undefined,
          includesDetailCodeNm: filters.includesDetailCodeNm
            ? true
            : undefined,
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

  // ---- Detail reload ----
  const reloadDetail = useCallback(
    (groupId: string | null, filters: DetailFilters) => {
      if (!groupId) {
        detailGrid.reset([]);
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
            filters.useYn === "Y" || filters.useYn === "N"
              ? filters.useYn
              : undefined,
          page: 1,
          limit: DETAIL_LIMIT,
        });
        if (!("error" in res)) {
          detailGrid.reset(res.rows);
          setDetailTotal(res.total);
        } else {
          detailGrid.reset([]);
          setDetailTotal(0);
        }
      });
    },
    [detailGrid],
  );

  // selected group label (used by detail header + export filename)
  const selectedGroup = useMemo(
    () => masterGrid.rows.find((r) => r.data.id === selectedGroupId)?.data ?? null,
    [masterGrid.rows, selectedGroupId],
  );
  const selectedGroupCode = selectedGroup?.code ?? null;
  const selectedGroupName = selectedGroup?.name ?? null;

  // ---- Master row selection (gated by detail dirty state) ----
  const guardedSelect = useCallback(
    (id: string) => {
      const switchTo = () => {
        setSelectedGroupId(id);
        setDetailDraft(DETAIL_DEFAULTS);
        setDetailFilters(DETAIL_DEFAULTS);
        reloadDetail(id, DETAIL_DEFAULTS);
      };
      if (detailGrid.dirtyCount > 0 && id !== selectedGroupId) {
        setPendingNav(() => switchTo);
      } else {
        switchTo();
      }
    },
    [detailGrid.dirtyCount, reloadDetail, selectedGroupId],
  );

  // ---- Master save ----
  const handleMasterSave = useCallback(() => {
    const liveRows = masterGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    const dups = findDuplicateKeys(liveRows, ["code"]);
    if (dups.length > 0) {
      alert(t("duplicates", { codes: dups.join(", ") }));
      return;
    }
    startMasterSave(async () => {
      const changes = masterGrid.toBatch();
      const result = await saveCodeGroups({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        reloadMaster(masterUrlFilters);
        // selected group may have been deleted — clear if so
        if (
          selectedGroupId &&
          changes.deletes.includes(selectedGroupId)
        ) {
          setSelectedGroupId(null);
          detailGrid.reset([]);
          setDetailTotal(0);
        }
      } else {
        alert(result.errors?.map((e) => e.message).join("\n") ?? t("saveError"));
      }
    });
  }, [
    masterGrid,
    masterUrlFilters,
    reloadMaster,
    selectedGroupId,
    detailGrid,
    t,
  ]);

  // ---- Detail save ----
  const handleDetailSave = useCallback(() => {
    if (!selectedGroupId) return;
    const liveRows = detailGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    const dups = findDuplicateKeys(liveRows, ["code"]);
    if (dups.length > 0) {
      alert(t("duplicates", { codes: dups.join(", ") }));
      return;
    }
    startDetailSave(async () => {
      const changes = detailGrid.toBatch();
      const result = await saveCodeItems({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        reloadDetail(selectedGroupId, detailFilters);
        // master subCnt 갱신을 위해 master도 reload
        reloadMaster(masterUrlFilters);
      } else {
        alert(result.errors?.map((e) => e.message).join("\n") ?? t("saveError"));
      }
    });
  }, [
    detailGrid,
    selectedGroupId,
    detailFilters,
    reloadDetail,
    reloadMaster,
    masterUrlFilters,
    t,
  ]);

  // ---- Insert / Copy ----
  const handleMasterInsert = useCallback(() => {
    masterGrid.insertBlank(makeBlankCodeGroup());
  }, [masterGrid]);

  const handleMasterCopy = useCallback(() => {
    if (!selectedGroupId) {
      alert(t("groupSection.filter.code") + ": " + t("itemSection.emptyMaster"));
      return;
    }
    masterGrid.duplicate(selectedGroupId, (clone) => ({
      ...clone,
      id: crypto.randomUUID(),
      code: "",
      subCnt: 0,
    }));
  }, [masterGrid, selectedGroupId, t]);

  const handleDetailInsert = useCallback(() => {
    if (!selectedGroupId) {
      alert(t("itemSection.emptyMaster"));
      return;
    }
    detailGrid.insertBlank(makeBlankCodeItem(selectedGroupId));
  }, [detailGrid, selectedGroupId, t]);

  const handleDetailCopy = useCallback(() => {
    if (!selectedGroupId) return;
    // copy the first selected/clean row as a template — simplest UX.
    // (No multi-row selection in this grid; pick top non-deleted row.)
    const source = detailGrid.rows.find((r) => r.state !== "deleted");
    if (!source) {
      alert("복사할 세부코드가 없습니다.");
      return;
    }
    detailGrid.duplicate(source.data.id, (clone) => ({
      ...clone,
      id: crypto.randomUUID(),
      code: "",
    }));
  }, [detailGrid, selectedGroupId]);

  // ---- Export — Excel(.xlsx) via shared exportToExcel utility ----
  // Boolean → 사용/사용안함, select code → option label은 cellFormatter로 매핑.
  // 삭제 예정(state==="deleted") 행은 제외해 사용자 의도를 따른다.

  const handleMasterExport = useCallback(() => {
    const rows = masterGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    if (rows.length === 0) {
      alert("내려받을 데이터가 없습니다.");
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
  }, [masterGrid.rows, businessDivOptions, tGroup]);

  const handleDetailExport = useCallback(() => {
    const rows = detailGrid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    if (rows.length === 0) {
      alert("내려받을 데이터가 없습니다.");
      return;
    }
    const columns = getCodeItemExportColumns(tItem);
    const filename = `공통코드_세부_${selectedGroupCode ?? "group"}`;
    void exportToExcel<CodeItemRow, (typeof columns)[number]>({
      filename,
      sheetName: tItem("title"),
      columns,
      rows,
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
  }, [detailGrid.rows, selectedGroupCode, tItem]);

  // ---- Master filter apply / reset ----
  const applyMasterFilters = useCallback(() => {
    setMasterUrlFilter("q", masterDraft.q);
    setMasterUrlFilter("qName", masterDraft.qName);
    setMasterUrlFilter("includesDetailCodeNm", masterDraft.includesDetailCodeNm);
    setMasterUrlFilter("kind", masterDraft.kind);
    reloadMaster(masterDraft);
  }, [masterDraft, reloadMaster, setMasterUrlFilter]);

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
      <div className="space-y-6">
        <CodeGroupGrid
          grid={masterGrid}
          total={masterTotal}
          selectedId={selectedGroupId}
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
          businessDivOptions={businessDivOptions}
        />
        <CodeItemGrid
          grid={detailGrid}
          total={detailTotal}
          selectedGroupId={selectedGroupId}
          selectedGroupCode={selectedGroupCode}
          selectedGroupName={selectedGroupName}
          draftFilters={detailDraft}
          onDraftFilterChange={setDetailDraft}
          onApplyFilters={applyDetailFilters}
          onResetFilters={resetDetailFilters}
          saving={savingDetail}
          onInsert={handleDetailInsert}
          onCopy={handleDetailCopy}
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
