"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/InfraLicensesGrid.tsx
 *
 * 인프라 라이선스 (TBIZ500) 그리드.
 *
 * Merged from P2-A (Task 9) + origin/main (PR #41 DataGrid adoption):
 * - DataGrid baseline: <DataGrid> + groupHeaders + numeric column types (from main)
 * - P2-A features: searchDevGbCd filter via CodeGroupPopupLauncher, useUrlFilters,
 *   findDuplicateKeys composite-key dedup guard (companyId + devGbCode + symd),
 *   DataGridToolbar wired to server-side exportInfraLicenses (full-data + audit log)
 *
 * 컬럼 구성 (총 31열) - groupHeaders span 합계와 일치해야 한다.
 *   - 기본정보(8): companyId, symd, eymd, devGbCode, domainAddr, ipAddr, userCnt, corpCnt
 *   - 사용자/관리(4): emp/hr/org/edu
 *   - 급여/근태/복지(5): pap/car/cpn/tim/ben
 *   - 포털/시스템(7): app/eis/sys/year/board/wl/pds
 *   - 협업/보안/IDP(6): idp/abhr/work/sec/doc/dis
 *   - 메타(1): createdAt
 */
import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { Input } from "@/components/ui/input";
import {
  CodeGroupPopupLauncher,
  type CodeGroupItem,
} from "@/components/grid/CodeGroupPopupLauncher";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { triggerDownload } from "@/lib/utils/triggerDownload";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { ColumnDef, GroupHeader, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { InfraLicenseRow } from "@jarvis/shared/validation/infra/license";
import { listInfraLicenses, saveInfraLicenses } from "../actions";
import { exportInfraLicenses } from "../export";
import { makeBlankInfraLicense } from "./useInfraLicensesGridState";

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

/** 22 모듈 그룹 메타 — group 헤더 라벨 + 컬럼 라벨/key 정의 */
const MODULE_GROUPS: {
  label: string;
  columns: { key: keyof InfraLicenseRow & string; label: string }[];
}[] = [
  {
    label: "사용자/관리",
    columns: [
      { key: "empYn", label: "직원" },
      { key: "hrYn", label: "인사" },
      { key: "orgYn", label: "조직" },
      { key: "eduYn", label: "교육" },
    ],
  },
  {
    label: "급여/근태/복지",
    columns: [
      { key: "papYn", label: "급여" },
      { key: "carYn", label: "차량" },
      { key: "cpnYn", label: "쿠폰" },
      { key: "timYn", label: "근태" },
      { key: "benYn", label: "복지" },
    ],
  },
  {
    label: "포털/시스템",
    columns: [
      { key: "appYn", label: "앱" },
      { key: "eisYn", label: "EIS" },
      { key: "sysYn", label: "시스템" },
      { key: "yearYn", label: "연말" },
      { key: "boardYn", label: "게시판" },
      { key: "wlYn", label: "WF" },
      { key: "pdsYn", label: "PDS" },
    ],
  },
  {
    label: "협업/보안/IDP",
    columns: [
      { key: "idpYn", label: "IDP" },
      { key: "abhrYn", label: "ABHR" },
      { key: "workYn", label: "워크" },
      { key: "secYn", label: "보안" },
      { key: "docYn", label: "문서" },
      { key: "disYn", label: "파견" },
    ],
  },
];

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
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [exporting, startExport] = useTransition();
  const [dupError, setDupError] = useState<string | null>(null);
  const [isSearching, startReload] = useTransition();
  const [pendingFilters, setPendingFilters] = useState({
    q: initialQ,
    searchDevGbCd: initialSearchDevGbCd,
  });
  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

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
          setTotal(res.total);
          setPage(nextPage);
        }
      });
    },
    [limit],
  );

  // ---------------------------------------------------------------------------
  // Columns + groupHeaders
  // ---------------------------------------------------------------------------
  const columns: ColumnDef<InfraLicenseRow>[] = useMemo(() => {
    const moduleColumns: ColumnDef<InfraLicenseRow>[] = MODULE_GROUPS.flatMap((g) =>
      g.columns.map(
        (m) =>
          ({
            key: m.key,
            label: m.label,
            type: "boolean",
            editable: true,
            width: 56,
          }) satisfies ColumnDef<InfraLicenseRow>,
      ),
    );

    return [
      {
        key: "companyId",
        label: "회사",
        type: "select",
        editable: true,
        required: true,
        options: companyOptions,
        width: 220,
      },
      {
        key: "symd",
        label: "시작일",
        type: "date",
        editable: true,
        required: true,
        width: 130,
      },
      {
        key: "eymd",
        label: "종료일",
        type: "date",
        editable: true,
        width: 130,
      },
      {
        key: "devGbCode",
        label: "환경",
        type: "select",
        editable: true,
        required: true,
        options: devGbOptions,
        width: 110,
      },
      {
        key: "domainAddr",
        label: "도메인",
        type: "text",
        editable: true,
        width: 220,
      },
      {
        key: "ipAddr",
        label: "IP",
        type: "text",
        editable: true,
        width: 140,
      },
      {
        key: "userCnt",
        label: "사용자수",
        type: "numeric",
        editable: true,
        width: 90,
      },
      {
        key: "corpCnt",
        label: "법인수",
        type: "numeric",
        editable: true,
        width: 90,
      },
      ...moduleColumns,
      {
        key: "createdAt",
        label: "등록일",
        type: "readonly",
        width: 110,
        render: (row) => (row.createdAt ? row.createdAt.slice(0, 10) : ""),
      },
    ];
  }, [companyOptions, devGbOptions]);

  const groupHeaders: GroupHeader[] = useMemo(
    () => [
      { label: "기본정보", span: 8 },
      ...MODULE_GROUPS.map((g) => ({
        label: g.label,
        span: g.columns.length,
        className: "border-l border-slate-200",
      })),
      { label: "메타", span: 1, className: "border-l border-slate-200" },
    ],
    [],
  );

  // ---------------------------------------------------------------------------
  // Save handler with composite-key dedup guard (companyId + devGbCode + symd)
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(
    async (changes: GridChanges<InfraLicenseRow>): Promise<GridSaveResult> => {
      // Composite-key dedup guard: check new rows for duplicate companyId+devGbCode+symd
      if (changes.creates.length > 0) {
        const dups = findDuplicateKeys(
          changes.creates as unknown as Record<string, unknown>[],
          ["companyId", "devGbCode", "symd"],
        );
        if (dups.length > 0) {
          setDupError(`중복된 키가 있습니다: ${dups.join(", ")}`);
          return { ok: false, errors: [{ message: `중복된 키: ${dups.join(", ")}` }] };
        }
      }
      setDupError(null);

      const result = await saveInfraLicenses({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        // Re-fetch current page to refresh server-projected fields (createdAt, etc.)
        const res = await listInfraLicenses({
          q: filterValues.q || undefined,
          searchDevGbCd: filterValues.searchDevGbCd || undefined,
          page,
          limit,
        });
        if (!("error" in res)) {
          setTotal(res.total);
        }
      }
      return result;
    },
    [filterValues, page, limit],
  );

  // ---------------------------------------------------------------------------
  // Excel export — server-side full-data export with audit log (P2-A design)
  // NOTE: does NOT use client-side excelExport.ts (that exports only loaded rows).
  // exportInfraLicenses server action fetches all rows + writes audit log entry.
  // ---------------------------------------------------------------------------
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

  return (
    <div className="space-y-3">
      {/* GridSearchForm: q + searchDevGbCd filter panel with [조회] button */}
      <GridSearchForm
        onSearch={() => {
          setFilterValue("q", pendingFilters.q);
          setFilterValue("searchDevGbCd", pendingFilters.searchDevGbCd);
          setFilterValue("page", "1");
          reload(1, pendingFilters.q, pendingFilters.searchDevGbCd);
        }}
        isSearching={isSearching}
      >
        <GridFilterField label="검색" className="w-[210px]">
          <Input
            type="text"
            value={pendingFilters.q}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="회사코드/회사명/도메인/IP"
            className="h-8"
          />
        </GridFilterField>
        {/* searchDevGbCd filter — CodeGroupPopupLauncher (B10025 code group) */}
        <GridFilterField label="환경" className="w-[200px]">
          <div className="flex items-center gap-1" data-testid="searchDevGbCd-filter">
            <span
              className="min-w-[60px] rounded border border-(--border-default) bg-(--bg-page) px-2 py-1 text-[13px] text-(--fg-primary)"
              data-testid="searchDevGbCd-display"
            >
              {devGbOptions.find((o) => o.value === pendingFilters.searchDevGbCd)?.label ?? "전체"}
            </span>
            <CodeGroupPopupLauncher
              triggerLabel="선택"
              items={devGbCodeItems}
              onSelect={(item) => {
                const newVal = item.code === pendingFilters.searchDevGbCd ? "" : item.code;
                setPending("searchDevGbCd", newVal);
              }}
              searchable={false}
            />
            {pendingFilters.searchDevGbCd ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPending("searchDevGbCd", "")}
                className="px-2 text-[12px]"
              >
                초기화
              </Button>
            ) : null}
          </div>
        </GridFilterField>
      </GridSearchForm>

      {dupError ? (
        <div
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {dupError}
        </div>
      ) : null}

      <DataGrid<InfraLicenseRow>
        rows={initialRows}
        total={total}
        columns={columns}
        filters={[]}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankInfraLicense}
        onExport={handleExport}
        isExporting={exporting}
        onPageChange={(nextPage) => {
          setFilterValue("page", String(nextPage));
          reload(nextPage, filterValues.q, filterValues.searchDevGbCd);
        }}
        onFilterChange={() => {
          /* external filters managed in strip above; DataGrid filters[] is empty */
        }}
        onSave={handleSave}
        groupHeaders={groupHeaders}
        emptyMessage="데이터가 없습니다."
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
