"use client";
/**
 * apps/web/app/(app)/add-dev/_components/AddDevGridContainer.tsx
 *
 * 추가개발 목록 DataGrid 래퍼.
 * - readOnly 모드 (편집은 상세 페이지에서)
 * - 행 더블클릭 → /add-dev/[id] 이동
 * - GridSearchForm + GridFilterField 필터 패널
 */
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Input } from "@/components/ui/input";
import { useTabState } from "@/components/layout/tabs/useTabState";
import type { ColumnDef, FilterDef } from "@/components/grid/types";
import { listAddDev } from "../actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

// ---------------------------------------------------------------------------
// Row type (inferred from listAdditionalDev return shape)
// ---------------------------------------------------------------------------

type AddDevRow = {
  id: string;
  requestYearMonth: string | null;
  projectName: string | null;
  customerCompanyName: string | null;
  part: string | null;
  requesterName: string | null;
  status: string;
  contractAmount: string | null;
  pmId: string | null;
  pmName: string | null;
  pmSabun: string | null;
  updatedAt: Date;
};

type Props = {
  initial: AddDevRow[];
  total: number;
};

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

// makeBlankRow는 readOnly 그리드이므로 실제로 호출되지 않으나
// DataGrid 시그니처 필수 prop이므로 더미로 제공한다.
function makeBlankRow(): AddDevRow {
  return {
    id: crypto.randomUUID(),
    requestYearMonth: null,
    projectName: null,
    customerCompanyName: null,
    part: null,
    requesterName: null,
    status: "협의중",
    contractAmount: null,
    pmId: null,
    pmName: null,
    pmSabun: null,
    updatedAt: new Date(),
  };
}

const STATUS_OPTIONS = [
  { value: "협의중", label: "협의중" },
  { value: "진행중", label: "진행중" },
  { value: "완료", label: "완료" },
  { value: "보류", label: "보류" },
];

const PART_OPTIONS = [
  { value: "Saas", label: "Saas" },
  { value: "외부", label: "외부" },
  { value: "모바일", label: "모바일" },
  { value: "채용", label: "채용" },
];

export function AddDevGridContainer({ initial, total }: Props) {
  const router = useRouter();
  const gridApiRef = useRef<{ discardChanges: () => void } | null>(null);

  const [rows, setRows] = useState<AddDevRow[]>(initial);
  const [totalCount, setTotalCount] = useState(total);
  const [limit, setLimit] = useState<number>(PAGE_SIZE);
  const [page, setPage] = useTabState<number>("addDev.page", 1);
  const [filterValues, setFilterValues] = useTabState<Record<string, string>>(
    "addDev.filters",
    {},
  );
  const [pendingFilters, setPendingFilters] = useTabState<Record<string, string>>(
    "addDev.pendingFilters",
    {},
  );
  const [isSearching, startTransition] = useTransition();

  const setPending = (key: string, value: string) =>
    setPendingFilters((p) => ({ ...p, [key]: value }));

  const reload = useCallback(
    (nextPage: number, nextFilters: Record<string, string>, nextLimit?: number) => {
      startTransition(async () => {
        const res = await listAddDev({
          q: nextFilters.q || undefined,
          status: nextFilters.status || undefined,
          part: nextFilters.part || undefined,
          page: nextPage,
          pageSize: nextLimit ?? limit,
        });
        if (res.ok) {
          setRows(res.data as AddDevRow[]);
          setTotalCount(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
        }
      });
    },
    [limit, setPage, setFilterValues],
  );

  const COLUMNS: ColumnDef<AddDevRow>[] = useMemo(
    () => [
      // 식별 컬럼 (좌측)
      {
        key: "requestYearMonth",
        label: "요청년월",
        type: "readonly",
        width: 90,
        lockOnExisting: true,
      },
      // 본문 컬럼
      {
        key: "customerCompanyName",
        label: "요청회사",
        type: "readonly",
        width: 150,
      },
      {
        key: "projectName",
        label: "프로젝트명",
        type: "readonly",
      },
      {
        key: "part",
        label: "파트",
        type: "readonly",
        width: 80,
      },
      {
        key: "requesterName",
        label: "요청자",
        type: "readonly",
        width: 90,
      },
      {
        key: "status",
        label: "진행상태",
        type: "readonly",
        width: 90,
      },
      {
        key: "contractAmount",
        label: "계약금액",
        type: "readonly",
        width: 110,
        render: (row) =>
          row.contractAmount
            ? new Intl.NumberFormat("ko-KR").format(Number(row.contractAmount))
            : "—",
      },
      {
        key: "pmName",
        label: "PM",
        type: "readonly",
        width: 90,
        render: (row) =>
          row.pmName
            ? row.pmSabun
              ? `${row.pmSabun} · ${row.pmName}`
              : row.pmName
            : "—",
      },
      // audit (우측)
      {
        key: "updatedAt",
        label: "업데이트",
        type: "readonly",
        width: 110,
        render: (row) =>
          new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(
            new Date(row.updatedAt),
          ),
      },
    ],
    [],
  );

  const FILTERS: FilterDef<AddDevRow>[] = [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <GridSearchForm
        onResetGrid={() => gridApiRef.current?.discardChanges()}
        onSearch={() => reload(1, pendingFilters)}
        isSearching={isSearching}
      >
        <GridFilterField label="상태" className="w-[130px]">
          <select
            value={pendingFilters.status ?? ""}
            onChange={(e) => setPending("status", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="파트" className="w-[130px]">
          <select
            value={pendingFilters.part ?? ""}
            onChange={(e) => setPending("part", e.target.value)}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          >
            <option value="">전체</option>
            {PART_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </GridFilterField>
        <GridFilterField label="프로젝트명 / 내용" className="w-[220px]">
          <Input
            type="text"
            value={pendingFilters.q ?? ""}
            onChange={(e) => setPending("q", e.target.value)}
            placeholder="프로젝트명 또는 요청내용"
            className="h-8"
          />
        </GridFilterField>
      </GridSearchForm>

      <DataGrid<AddDevRow>
        rows={rows}
        total={totalCount}
        columns={COLUMNS}
        filters={FILTERS}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankRow}
        filterValues={filterValues}
        readOnly
        onGridReady={(api) => {
          gridApiRef.current = api;
        }}
        windowedPagination
        onAutoLimitChange={(next) => {
          setLimit(next);
          reload(1, filterValues, next);
        }}
        onPageChange={(p) => reload(p, filterValues)}
        onFilterChange={(f) => reload(1, f)}
        onSave={async () => ({ ok: true })}
        onRowDoubleClick={(row) => router.push(`/add-dev/${row.id}`)}
      />
    </div>
  );
}
