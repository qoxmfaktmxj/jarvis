"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/InfraLicensesGrid.tsx
 *
 * 인프라 라이선스 (TBIZ500) 그리드.
 *
 * Phase-1 이후 DataGrid가 `numeric`(userCnt/corpCnt) · `groupHeaders`(22 모듈 그룹
 * 4개) · `textarea`을 모두 지원하므로 본 화면을 declarative `<DataGrid>` 로 전환했다.
 * 외부 필터 행(회사/도메인/IP 검색 + 환경 select) 과 Excel export 토스트는 그리드
 * 위에 별도 strip으로 둔다.
 *
 * 컬럼 구성 (총 31열) - groupHeaders span 합계와 일치해야 한다.
 *   - 기본정보(8): companyId, symd, eymd, devGbCode, domainAddr, ipAddr, userCnt, corpCnt
 *   - 사용자/관리(4): emp/hr/org/edu
 *   - 급여/근태/복지(5): pap/car/cpn/tim/ben
 *   - 포털/시스템(7): app/eis/sys/year/board/wl/pds
 *   - 협업/보안/IDP(6): idp/abhr/work/sec/doc/dis
 *   - 메타(1): createdAt
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { exportToExcel } from "@/components/grid/utils/excelExport";
import type { ColumnDef, GroupHeader, GridChanges, GridSaveResult } from "@/components/grid/types";
import type { InfraLicenseRow } from "@jarvis/shared/validation/infra/license";
import { listInfraLicenses, saveInfraLicenses } from "../actions";
import { makeBlankInfraLicense } from "./useInfraLicensesGridState";

type Option = { value: string; label: string };

type Props = {
  initialRows: InfraLicenseRow[];
  initialTotal: number;
  page: number;
  limit: number;
  companyOptions: Option[];
  devGbOptions: Option[];
};

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

export function InfraLicensesGrid({
  initialRows,
  initialTotal,
  page: initialPage,
  limit,
  companyOptions,
  devGbOptions,
}: Props) {
  const [rows, setRows] = useState<InfraLicenseRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [filterValues, setFilterValues] = useState<{ q: string; devGbCode: string }>({
    q: "",
    devGbCode: "",
  });
  const [, startReload] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const reload = useCallback(
    (nextPage: number, nextFilters: { q: string; devGbCode: string }) => {
      startReload(async () => {
        const res = await listInfraLicenses({
          q: nextFilters.q || undefined,
          devGbCode: nextFilters.devGbCode || undefined,
          page: nextPage,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as InfraLicenseRow[]);
          setTotal(res.total);
          setPage(nextPage);
          setFilterValues(nextFilters);
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
  // Save handler
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(
    async (changes: GridChanges<InfraLicenseRow>): Promise<GridSaveResult> => {
      const result = await saveInfraLicenses({
        creates: changes.creates,
        updates: changes.updates,
        deletes: changes.deletes,
      });
      if (result.ok) {
        // Re-fetch the current page to refresh server-projected fields (createdAt, etc.)
        const res = await listInfraLicenses({
          q: filterValues.q || undefined,
          devGbCode: filterValues.devGbCode || undefined,
          page,
          limit,
        });
        if (!("error" in res)) {
          setRows(res.rows as InfraLicenseRow[]);
          setTotal(res.total);
        }
      }
      return result;
    },
    [filterValues, page, limit],
  );

  // ---------------------------------------------------------------------------
  // Excel export
  // ---------------------------------------------------------------------------
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportColumns = columns.map((c) => ({
        key: c.key,
        header: c.label,
      }));
      const companyMap = new Map(companyOptions.map((o) => [o.value, o.label]));
      const devGbMap = new Map(devGbOptions.map((o) => [o.value, o.label]));
      await exportToExcel({
        filename: "인프라_라이센스",
        sheetName: "라이센스",
        columns: exportColumns,
        rows: rows,
        cellFormatter: (row, col) => {
          const v = (row as Record<string, unknown>)[col.key];
          // booleans → Y/N
          const boolKeys = MODULE_GROUPS.flatMap((g) => g.columns.map((m) => m.key)) as string[];
          if (boolKeys.includes(col.key)) return v ? "Y" : "N";
          if (col.key === "companyId" && typeof v === "string")
            return companyMap.get(v) ?? v;
          if (col.key === "devGbCode" && typeof v === "string")
            return devGbMap.get(v) ?? v;
          if (col.key === "createdAt" && typeof v === "string") return v.slice(0, 10);
          if (v === null || v === undefined) return "";
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
            return v;
          return String(v);
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [columns, rows, companyOptions, devGbOptions]);

  return (
    <div className="space-y-3">
      {/* Filter row + Excel toolbar above the grid */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          placeholder="회사코드/회사명/도메인/IP"
          value={filterValues.q}
          onChange={(e) => {
            const next = { ...filterValues, q: e.target.value };
            setFilterValues(next);
          }}
          onBlur={() => reload(1, filterValues)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reload(1, filterValues);
          }}
          className="h-8 w-64 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterValues.devGbCode}
          onChange={(e) => {
            const next = { ...filterValues, devGbCode: e.target.value };
            reload(1, next);
          }}
          className="h-8 rounded border border-slate-300 px-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">환경 (전체)</option>
          {devGbOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <DataGridToolbar
            onExport={handleExport}
            exportLabel="엑셀 다운로드"
            isExporting={isExporting}
          />
        </div>
      </div>

      <DataGrid<InfraLicenseRow>
        rows={rows}
        total={total}
        columns={columns}
        filters={[]}
        page={page}
        limit={limit}
        makeBlankRow={makeBlankInfraLicense}
        onPageChange={(nextPage) => reload(nextPage, filterValues)}
        onFilterChange={() => {
          /* external filters are managed above; DataGrid filters[] is empty */
        }}
        onSave={handleSave}
        groupHeaders={groupHeaders}
        emptyMessage="데이터가 없습니다."
      />
    </div>
  );
}
