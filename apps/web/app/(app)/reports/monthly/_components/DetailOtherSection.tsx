"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type {
  ColumnDef,
  GridChanges,
  GridSaveResult,
} from "@/components/grid/types";
import type { GridRow } from "@/components/grid/useGridState";
import { saveDetailOther } from "../actions";
import type { MonthReportDetailOtherRow } from "@jarvis/shared/validation/month-report";

interface Props {
  rows: MonthReportDetailOtherRow[];
  companyCd: string;
  ym: string;
  onSaved: (rows: MonthReportDetailOtherRow[]) => void;
}

type Row = MonthReportDetailOtherRow & { id: string };

/**
 * 월간 리포트 — 기타 상세 그리드.
 *
 * server row에는 `id` 필드가 없고 `seq` (int PK)가 식별자. DataGrid 제약
 * `T extends { id: string }`을 만족하기 위해 `id = String(seq)`로 합성.
 * 신규 행은 max(seq) + 1로 seq 할당, save 시 deletes는 originalSeq로 변환.
 *
 * 기존 자체 <table> + draft state 관리 → DataGrid 내부 useGridState에 위임
 * (admin/menus Phase B 패턴 동일).
 */
export function DetailOtherSection({ rows: serverRows, companyCd, ym, onSaved }: Props) {
  const t = useTranslations("Reports.Monthly.other");

  // server rows → grid rows (id=String(seq)). seq 자체는 행 식별자로 유지.
  const initialRows = useMemo<Row[]>(
    () => serverRows.map((r) => ({ ...r, id: String(r.seq) })),
    [serverRows],
  );

  // 신규 행 seq 발급용 — 현재 보유 중인 max seq 추적.
  const maxSeqRef = useRef<number>(
    Math.max(0, ...serverRows.map((r) => r.seq)),
  );
  useEffect(() => {
    maxSeqRef.current = Math.max(0, ...serverRows.map((r) => r.seq));
  }, [serverRows]);

  // grid rows mirror — onSave에서 GridChanges만 받아도 되지만, originalSeq를
  // dirty/deleted 행마다 추적하려면 onGridRowsChange로 외부 mirror 필요.
  const [gridRowsMirror, setGridRowsMirror] = useState<GridRow<Row>[]>([]);

  const makeBlankRow = useCallback((): Row => {
    const newSeq = maxSeqRef.current + 1;
    maxSeqRef.current = newSeq;
    return {
      enterCd: serverRows[0]?.enterCd ?? "",
      companyCd,
      ym,
      seq: newSeq,
      etcBizCd: null,
      etcTitle: null,
      etcMemo: null,
      updatedAt: new Date().toISOString(),
      updatedByName: null,
      id: String(newSeq),
    };
  }, [companyCd, ym, serverRows]);

  const COLUMNS = useMemo<ColumnDef<Row>[]>(
    () => [
      { key: "etcBizCd", label: t("etcBizCd"), type: "text", width: 80, editable: true },
      { key: "etcTitle", label: t("etcTitle"), type: "text", width: 192, editable: true },
      { key: "etcMemo", label: t("etcMemo"), type: "textarea", editable: true },
    ],
    [t],
  );

  const handleSave = useCallback(
    async (changes: GridChanges<Row>): Promise<GridSaveResult> => {
      const creates = changes.creates.map((r) => ({
        seq: r.seq,
        etcBizCd: r.etcBizCd,
        etcTitle: r.etcTitle,
        etcMemo: r.etcMemo,
      }));
      const updates = changes.updates.map((u) => {
        // dirty 행: 최신 data를 mirror에서 조회. patch만으로는 부족 (전체 필드 전송).
        const row = gridRowsMirror.find((r) => r.data.id === u.id)?.data;
        return {
          seq: row?.seq ?? Number(u.id),
          etcBizCd: row?.etcBizCd ?? null,
          etcTitle: row?.etcTitle ?? null,
          etcMemo: row?.etcMemo ?? null,
        };
      });
      // deletes — DataGrid가 string id 배열로 전달. server는 originalSeq(number) 기대.
      const deletes = changes.deletes.map((idStr) => Number(idStr));

      const result = await saveDetailOther({ companyCd, ym, creates, updates, deletes });
      if (!result.ok) {
        return { ok: false, errors: [{ message: t("saveFailed") }] };
      }

      // 저장 성공: 부모에 refreshed rows 통지 (server 재조회 회피 — optimistic)
      const refreshed: MonthReportDetailOtherRow[] = gridRowsMirror
        .filter((r) => r.state !== "deleted")
        .map((r) => ({
          enterCd: r.data.enterCd,
          companyCd: r.data.companyCd,
          ym: r.data.ym,
          seq: r.data.seq,
          etcBizCd: r.data.etcBizCd,
          etcTitle: r.data.etcTitle,
          etcMemo: r.data.etcMemo,
          updatedAt: new Date().toISOString(),
          updatedByName: r.data.updatedByName,
        }));
      onSaved(refreshed);
      return { ok: true };
    },
    [companyCd, ym, gridRowsMirror, onSaved, t],
  );

  return (
    <section className="rounded border border-(--border-default) bg-(--bg-surface) p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-(--fg-primary)">{t("title")}</h3>
      </header>
      <DataGrid<Row>
        rows={initialRows}
        total={initialRows.length}
        columns={COLUMNS}
        filters={[]}
        page={1}
        limit={10000}
        makeBlankRow={makeBlankRow}
        onGridRowsChange={setGridRowsMirror}
        emptyMessage={t("empty")}
        onPageChange={() => {}}
        onFilterChange={() => {}}
        onSave={handleSave}
      />
    </section>
  );
}
