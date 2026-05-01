"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/InfraLicensesGrid.tsx
 *
 * 인프라 라이선스 (TBIZ500) 그리드.
 *
 * Task 9 additions:
 * - DataGridToolbar with Excel export button
 * - useUrlFilters for URL-persistent filter state
 * - findDuplicateKeys composite-key dedup guard (companyId + devGbCode + symd)
 * - CodeGroupPopupLauncher on devGbCode cell (B10025 code group items)
 */
import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
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
import {
  CodeGroupPopupLauncher,
  type CodeGroupItem,
} from "@/components/grid/CodeGroupPopupLauncher";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { InfraLicenseRow } from "@jarvis/shared/validation/infra/license";
import { listInfraLicenses, saveInfraLicenses } from "../actions";
import { exportInfraLicenses } from "../export";
import {
  makeBlankInfraLicense,
  useInfraLicensesGridState,
} from "./useInfraLicensesGridState";
import { MODULE_COLUMNS_FLAT, MODULE_GROUPS } from "./ModuleCheckboxGroup";

type Option = { value: string; label: string };

type Props = {
  initialRows: InfraLicenseRow[];
  initialTotal: number;
  page: number;
  limit: number;
  companyOptions: Option[];
  /** devGb options — doubles as B10025 code group items for the popup */
  devGbOptions: Option[];
  /** Pre-selected devGbCode filter from URL (from page.tsx SSR) */
  initialSearchDevGbCd?: string;
  /** Pre-set text search query from URL */
  initialQ?: string;
};

/** Convert Option[] to CodeGroupItem[] for CodeGroupPopupLauncher */
function toCodeGroupItems(options: Option[]): readonly CodeGroupItem[] {
  return options.map((o) => ({ code: o.value, label: o.label }));
}

function InfraLicensesGridInner({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  companyOptions,
  devGbOptions,
  initialSearchDevGbCd = "",
  initialQ = "",
}: Props) {
  const t = useTranslations("Sales");

  const grid = useInfraLicensesGridState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [saving, startSave] = useTransition();
  const [exporting, startExport] = useTransition();
  const [, startReload] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [dupError, setDupError] = useState<string | null>(null);

  // URL-persistent filter state (useSearchParams requires Suspense boundary)
  const { values: filterValues, setValue: setFilterValue } = useUrlFilters({
    defaults: {
      q: initialQ,
      searchDevGbCd: initialSearchDevGbCd,
      page: String(initialPage),
    },
  });

  const devGbCodeItems = useMemo(() => toCodeGroupItems(devGbOptions), [devGbOptions]);

  const reload = useCallback(
    (nextPage: number, nextQ: string, nextDevGbCd: string) => {
      startReload(async () => {
        const res = await listInfraLicenses({
          q: nextQ || undefined,
          searchDevGbCd: nextDevGbCd || undefined,
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
    [grid, limit],
  );

  const guarded = useCallback(
    (action: () => void) => {
      if (grid.dirtyCount > 0) setPendingNav(() => action);
      else action();
    },
    [grid.dirtyCount],
  );

  const handleSave = useCallback(() => {
    // Composite-key dedup guard: companyId + devGbCode + symd
    const activeRows = grid.rows
      .filter((r) => r.state !== "deleted")
      .map((r) => r.data);
    const dups = findDuplicateKeys(activeRows, ["companyId", "devGbCode", "symd"]);
    if (dups.length > 0) {
      setDupError(`중복된 키가 있습니다: ${dups.join(", ")}`);
      return;
    }
    setDupError(null);

    startSave(async () => {
      const changes = grid.toBatch();
      const result = await saveInfraLicenses({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        await reload(page, filterValues.q, filterValues.searchDevGbCd);
      } else {
        const msg = result.errors?.map((e) => e.message).join("\n") ?? "저장 실패";
        alert(msg);
      }
    });
  }, [grid, page, filterValues, reload]);

  const handleExport = useCallback(() => {
    startExport(async () => {
      const result = await exportInfraLicenses({
        q: filterValues.q || undefined,
        searchDevGbCd: filterValues.searchDevGbCd || undefined,
      });
      if (result.ok) {
        triggerDownload(result.bytes, result.filename);
      } else {
        alert("엑셀 내보내기 실패: " + result.error);
      }
    });
  }, [filterValues]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // companyId → label lookup (for display in select cell)
  const companyLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of companyOptions) m.set(o.value, o.label);
    return m;
  }, [companyOptions]);

  const handleSearchDevGbCdSelect = useCallback(
    (item: CodeGroupItem) => {
      // toggle: selecting the same code again clears the filter
      const newVal = item.code === filterValues.searchDevGbCd ? "" : item.code;
      setFilterValue("searchDevGbCd", newVal);
      setFilterValue("page", "1");
      guarded(() => reload(1, filterValues.q, newVal));
    },
    [filterValues, setFilterValue, guarded, reload],
  );

  return (
    <div className="space-y-3">
      {/* DataGridToolbar: Excel export + GridToolbar (insert/save) unified */}
      <DataGridToolbar
        onExport={handleExport}
        exportLabel={t("Common.Excel.button")}
        isExporting={exporting}
      >
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={saving}
          onInsert={() => grid.insertBlank(makeBlankInfraLicense())}
          onSave={handleSave}
        />
      </DataGridToolbar>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">전체 {total.toLocaleString()}건</span>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          placeholder="회사코드/회사명/도메인/IP"
          value={filterValues.q}
          onChange={(e) => setFilterValue("q", e.target.value)}
          onBlur={() => guarded(() => reload(1, filterValues.q, filterValues.searchDevGbCd))}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              guarded(() => reload(1, filterValues.q, filterValues.searchDevGbCd));
          }}
          className="h-8 w-64 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        {/* searchDevGbCd filter — uses CodeGroupPopupLauncher with devGbOptions (B10025) */}
        <div className="flex items-center gap-1" data-testid="searchDevGbCd-filter">
          <span className="text-[13px] text-slate-500">
            {t("Common.Search.searchDevGbCd")}:
          </span>
          <span
            className="min-w-[60px] rounded border border-slate-300 px-2 py-1 text-[13px] text-slate-700"
            data-testid="searchDevGbCd-display"
          >
            {devGbOptions.find((o) => o.value === filterValues.searchDevGbCd)?.label ?? "전체"}
          </span>
          <CodeGroupPopupLauncher
            triggerLabel="선택"
            items={devGbCodeItems}
            onSelect={handleSearchDevGbCdSelect}
            searchable={false}
          />
          {filterValues.searchDevGbCd ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilterValue("searchDevGbCd", "");
                setFilterValue("page", "1");
                guarded(() => reload(1, filterValues.q, ""));
              }}
              className="px-2 text-[12px]"
            >
              초기화
            </Button>
          ) : null}
        </div>
      </div>

      {dupError ? (
        <div
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {dupError}
        </div>
      ) : null}

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-1" colSpan={2}></th>
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
              <th colSpan={2} className="border-l border-slate-200 px-2 py-1 text-center text-slate-500">
                수량
              </th>
              <th className="w-16 px-2 py-1"></th>
            </tr>
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

                const devGbLabel =
                  devGbOptions.find((o) => o.value === row.devGbCode)?.label ??
                  row.devGbCode ??
                  "";

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
                    <td
                      className="h-8 p-0 align-middle"
                      data-col="symd"
                      data-cell-value={row.symd}
                    >
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
                    {/* 환경 — CodeGroupPopupLauncher as devGbCode cell editor (render callback pattern) */}
                    <td
                      className="h-8 p-1 align-middle"
                      data-col="devGbCode"
                      data-cell-value={row.devGbCode}
                    >
                      <div className="flex items-center gap-1">
                        <span className="min-w-[36px] text-[12px] text-slate-700">
                          {devGbLabel}
                        </span>
                        <CodeGroupPopupLauncher
                          triggerLabel="▾"
                          items={devGbCodeItems}
                          onSelect={(item) => update("devGbCode", item.code)}
                          searchable={false}
                        />
                      </div>
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
          onClick={() => {
            const next = page - 1;
            setFilterValue("page", String(next));
            guarded(() => reload(next, filterValues.q, filterValues.searchDevGbCd));
          }}
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
          onClick={() => {
            const next = page + 1;
            setFilterValue("page", String(next));
            guarded(() => reload(next, filterValues.q, filterValues.searchDevGbCd));
          }}
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

/**
 * Suspense wrapper because useUrlFilters uses useSearchParams(),
 * which requires Suspense when rendered as a Server Component child.
 */
export function InfraLicensesGrid(props: Props) {
  return (
    <Suspense fallback={null}>
      <InfraLicensesGridInner {...props} />
    </Suspense>
  );
}
