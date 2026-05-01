"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/InfraLicensesGrid.tsx
 *
 * 인프라 라이선스 (TBIZ500) 그리드.
 *
 * 일반 도메인 그리드와 달리 22 모듈 boolean + 숫자 두 컬럼(userCnt/corpCnt) 때문에
 * 공유 <DataGrid> 추상화로는 깔끔하게 표현되지 않는다(커스텀 헤더 그룹 + numeric 셀).
 * 따라서 본 화면은 공유 cell/hook(useGridState · EditableTextCell · EditableSelectCell ·
 * EditableDateCell · EditableBooleanCell · EditableNumericCell · GridToolbar ·
 * RowStatusBadge · UnsavedChangesDialog)을 직접 조립한 커스텀 테이블이다.
 * <DataGrid>는 의도적으로 변경하지 않는다(Phase-Sales P1.5 Task 5의 forbidden list).
 *
 * 디자인 표준은 admin/companies와 동일하게 유지: h-8 행, sticky bg-slate-50 헤더,
 * 신규/변경/삭제 상태 배지·행 색상.
 *
 * Baseline applied: Task 9 (2026-05-01) — DataGridToolbar + useUrlFilters + dupChk.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { RowStatusBadge } from "@/components/grid/RowStatusBadge";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableDateCell } from "@/components/grid/cells/EditableDateCell";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv-export";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { InfraLicenseRow } from "@jarvis/shared/validation/infra/license";
import { listInfraLicenses, saveInfraLicenses } from "../actions";
import {
  makeBlankInfraLicense,
  useInfraLicensesGridState,
} from "./useInfraLicensesGridState";
import { MODULE_COLUMNS_FLAT, MODULE_GROUPS } from "./ModuleCheckboxGroup";

type Option = { value: string; label: string };

type FilterDefaults = {
  q: string;
  devGbCode: string;
};

type Props = {
  initialRows: InfraLicenseRow[];
  initialTotal: number;
  page: number;
  limit: number;
  companyOptions: Option[];
  devGbOptions: Option[];
  initialFilters?: Partial<FilterDefaults>;
};

export function InfraLicensesGrid({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  companyOptions,
  devGbOptions,
  initialFilters,
}: Props) {
  const tSales = useTranslations("Sales");
  const grid = useInfraLicensesGridState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [saving, startSave] = useTransition();
  const [, startReload] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  // URL-synced filter state (Task 4 I-1 / Task 7 pattern).
  // useMemo for stable FILTER_DEFAULTS reference — prevents useUrlFilters re-render loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const FILTER_DEFAULTS: FilterDefaults = useMemo(
    () => ({
      q: initialFilters?.q ?? "",
      devGbCode: initialFilters?.devGbCode ?? "",
    }),
    [],
  );

  const { values, setValue } = useUrlFilters<FilterDefaults>({ defaults: FILTER_DEFAULTS });

  // Local state for q input: avoids cursor-jump race between URL-derived value and live input.
  // Debounced 300ms effect commits to URL — mirrors Task 4 fix chargerNm pattern.
  const [qInput, setQInput] = useState(values.q);

  // Reverse sync: URL → local (browser back/forward navigation).
  useEffect(() => {
    setQInput(values.q);
  }, [values.q]);

  // Local → debounce → URL + reload.
  useEffect(() => {
    if (qInput === values.q) return;
    const t = setTimeout(() => {
      setValue("q", qInput);
      reload(1, { ...values, q: qInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const reload = useCallback(
    (nextPage: number, nextFilters: FilterDefaults) => {
      startReload(async () => {
        const res = await listInfraLicenses({
          q: nextFilters.q || undefined,
          devGbCode: nextFilters.devGbCode || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          grid.reset(res.rows as InfraLicenseRow[]);
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, limit],
  );

  const guarded = useCallback(
    (action: () => void) => {
      if (grid.dirtyCount > 0) setPendingNav(() => action);
      else action();
    },
    [grid.dirtyCount],
  );

  // CSV export: Hidden:0 visible columns only (Hidden:1 = PK/workspaceId/legacy codes).
  // 22 module boolean columns included per infra-license domain rule.
  const handleExport = useCallback(() => {
    const csv = rowsToCsv(grid.rows.map((r) => r.data), [
      { key: "devGbCode", header: "환경" },
      { key: "domainAddr", header: "도메인" },
      { key: "ipAddr", header: "IP" },
      { key: "symd", header: "시작일" },
      { key: "eymd", header: "종료일" },
      // 사용자/관리
      { key: "empYn", header: "직원" },
      { key: "hrYn", header: "인사" },
      { key: "orgYn", header: "조직" },
      { key: "eduYn", header: "교육" },
      // 급여/근태/복지
      { key: "papYn", header: "급여" },
      { key: "carYn", header: "차량" },
      { key: "cpnYn", header: "쿠폰" },
      { key: "timYn", header: "근태" },
      { key: "benYn", header: "복지" },
      // 포털/시스템
      { key: "appYn", header: "앱" },
      { key: "eisYn", header: "EIS" },
      { key: "sysYn", header: "시스템" },
      { key: "yearYn", header: "연말" },
      { key: "boardYn", header: "게시판" },
      { key: "wlYn", header: "WF" },
      { key: "pdsYn", header: "PDS" },
      // 협업/보안/IDP
      { key: "idpYn", header: "IDP" },
      { key: "abhrYn", header: "ABHR" },
      { key: "workYn", header: "워크" },
      { key: "secYn", header: "보안" },
      { key: "docYn", header: "문서" },
      { key: "disYn", header: "파견" },
      // 수량
      { key: "userCnt", header: "사용자수" },
      { key: "corpCnt", header: "법인수" },
      { key: "createdAt", header: "등록일자" },
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `infra-licenses_${date}.csv`);
  }, [grid.rows]);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const changes = grid.toBatch();

      // dupChk: composite key (companyId × devGbCode × symd) across all non-deleted rows.
      // Mirrors the DB unique index: infra_license_ws_company_symd_gb_uniq.
      const allRowsForDupCheck = grid.rows
        .filter((r) => r.state !== "deleted")
        .map((r) => ({
          companyId: r.data.companyId,
          devGbCode: r.data.devGbCode,
          symd: r.data.symd,
        }));
      const dups = findDuplicateKeys(allRowsForDupCheck, ["companyId", "devGbCode", "symd"]);
      if (dups.length > 0) {
        alert(tSales("Common.DupCheck.message", { count: dups.length }));
        return;
      }

      const result = await saveInfraLicenses({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        await reload(page, values);
      } else {
        const msg = result.errors?.map((e) => e.message).join("\n") ?? "저장 실패";
        alert(msg);
      }
    });
  }, [grid, page, values, reload, tSales]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // companyId → label lookup (for display in select cell)
  const companyLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of companyOptions) m.set(o.value, o.label);
    return m;
  }, [companyOptions]);

  return (
    <div className="space-y-3">
      {/* DataGridToolbar: unified strip — q input + devGbCode select + GridToolbar controls + export.
          Task 4 fix pattern (14d6229): place extra controls in children slot. */}
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={tSales("Common.Excel.label")}
      >
        {/* q free-text: 300ms debounce via local state */}
        <input
          type="text"
          placeholder={tSales("Common.Search.placeholder")}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="w-48 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        {/* devGbCode select: immediate reload */}
        <select
          value={values.devGbCode}
          onChange={(e) => {
            const next = e.target.value;
            setValue("devGbCode", next);
            guarded(() => reload(1, { ...values, devGbCode: next }));
          }}
          className="h-7 rounded border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="환경 필터"
        >
          <option value="">환경 (전체)</option>
          {devGbOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {/* GridToolbar: insert + save controls inside the unified strip */}
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={() => grid.insertBlank(makeBlankInfraLicense())}
          onSave={handleSave}
        />
      </DataGridToolbar>

      <div className="flex items-center">
        <span className="text-sm text-slate-600">전체 {total.toLocaleString()}건</span>
      </div>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {/* Group header row — 22 모듈 boolean 그룹 라벨 */}
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-1" colSpan={2}></th>
              {/* meta columns: company, symd, eymd, devGb, domain, ip */}
              <th colSpan={6} className="px-2 py-1 text-left text-slate-500">
                기본 정보
              </th>
              {MODULE_GROUPS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.columns.length}
                  className="border-l border-slate-200 px-2 py-1 text-center text-slate-700"
                >
                  {g.label}
                </th>
              ))}
              {/* userCnt, corpCnt */}
              <th colSpan={2} className="border-l border-slate-200 px-2 py-1 text-center text-slate-500">
                수량
              </th>
              <th className="w-16 px-2 py-1"></th>
            </tr>
            {/* Column header row */}
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">No</th>
              <th className="w-10 px-2 py-2">삭제</th>
              <th className="px-2 py-2 text-left" style={{ width: 220 }}>
                회사
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                시작일
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 130 }}>
                종료일
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 110 }}>
                환경
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 220 }}>
                도메인
              </th>
              <th className="px-2 py-2 text-left" style={{ width: 140 }}>
                IP
              </th>
              {MODULE_COLUMNS_FLAT.map((c) => (
                <th
                  key={c.key}
                  className="px-1 py-2 text-center"
                  style={{ width: 56 }}
                  data-module-key={c.key}
                >
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-2 text-right" style={{ width: 90 }}>
                사용자수
              </th>
              <th className="px-2 py-2 text-right" style={{ width: 90 }}>
                법인수
              </th>
              <th className="w-16 px-2 py-2 text-left">상태</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9 + MODULE_COLUMNS_FLAT.length + 2}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => {
                const row = r.data;
                const update = <K extends keyof InfraLicenseRow>(
                  key: K,
                  value: InfraLicenseRow[K],
                ) => grid.update(row.id, key, value);

                return (
                  <tr
                    key={row.id}
                    data-row-status={r.state}
                    className={[
                      "border-b border-slate-100 transition-colors duration-150",
                      "hover:bg-slate-50",
                      r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                      r.state === "new" ? "bg-blue-50/40" : "",
                      r.state === "dirty" ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td className="h-8 w-10 px-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={r.state === "deleted"}
                        onChange={() =>
                          r.state === "new" ? grid.removeNew(row.id) : grid.toggleDelete(row.id)
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                      />
                    </td>
                    {/* 회사 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="companyId"
                      data-cell-value={row.companyId}
                    >
                      <EditableSelectCell
                        value={row.companyId || null}
                        options={companyOptions}
                        onCommit={(v) => update("companyId", v ?? "")}
                        required
                      />
                      {!companyOptions.find((o) => o.value === row.companyId) && row.companyId && (
                        <span className="ml-1 text-[11px] text-slate-400">
                          {companyLabel.get(row.companyId) ?? "(deleted)"}
                        </span>
                      )}
                    </td>
                    {/* 시작일 */}
                    <td className="h-8 p-0 align-middle" data-col="symd" data-cell-value={row.symd}>
                      <EditableDateCell
                        value={row.symd || null}
                        onCommit={(v) => update("symd", v ?? "")}
                      />
                    </td>
                    {/* 종료일 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="eymd"
                      data-cell-value={row.eymd ?? ""}
                    >
                      <EditableDateCell
                        value={row.eymd}
                        onCommit={(v) => update("eymd", v)}
                      />
                    </td>
                    {/* 환경 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="devGbCode"
                      data-cell-value={row.devGbCode}
                    >
                      <EditableSelectCell
                        value={row.devGbCode || null}
                        options={devGbOptions}
                        onCommit={(v) => update("devGbCode", v ?? "")}
                        required
                      />
                    </td>
                    {/* 도메인 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="domainAddr"
                      data-cell-value={row.domainAddr ?? ""}
                    >
                      <EditableTextCell
                        value={row.domainAddr}
                        onCommit={(v) => update("domainAddr", v)}
                      />
                    </td>
                    {/* IP */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="ipAddr"
                      data-cell-value={row.ipAddr ?? ""}
                    >
                      <EditableTextCell
                        value={row.ipAddr}
                        onCommit={(v) => update("ipAddr", v)}
                      />
                    </td>
                    {/* 22 module booleans */}
                    {MODULE_COLUMNS_FLAT.map((m) => (
                      <td
                        key={m.key}
                        className="h-8 p-0 align-middle"
                        data-col={m.key}
                        data-cell-value={String(row[m.key])}
                      >
                        <EditableBooleanCell
                          value={Boolean(row[m.key])}
                          onCommit={(v) => update(m.key, v)}
                        />
                      </td>
                    ))}
                    {/* 사용자수 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="userCnt"
                      data-cell-value={row.userCnt === null ? "" : String(row.userCnt)}
                    >
                      <EditableNumericCell
                        value={row.userCnt}
                        onChange={(v) => update("userCnt", v)}
                      />
                    </td>
                    {/* 법인수 */}
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="corpCnt"
                      data-cell-value={row.corpCnt === null ? "" : String(row.corpCnt)}
                    >
                      <EditableNumericCell
                        value={row.corpCnt}
                        onChange={(v) => update("corpCnt", v)}
                      />
                    </td>
                    <td className="h-8 w-16 px-2 align-middle">
                      <RowStatusBadge state={r.state} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || saving}
          onClick={() => guarded(() => reload(page - 1, values))}
        >
          이전
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages || saving}
          onClick={() => guarded(() => reload(page + 1, values))}
        >
          다음
        </Button>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={grid.dirtyCount}
        onSaveAndContinue={async () => {
          handleSave();
          pendingNav?.();
          setPendingNav(null);
        }}
        onDiscardAndContinue={() => {
          grid.reset(grid.rows.map((r) => r.data));
          pendingNav?.();
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}
