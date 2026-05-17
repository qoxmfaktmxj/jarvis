"use client";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef } from "@/components/grid/types";
import type { StatsRow } from "@jarvis/shared/validation/service-desk";

type Row = StatsRow & { id: string };

/**
 * 회사별 유지보수 통계 그리드 (read-only).
 *
 * server StatsRow 타입에 `id` 필드가 없어서 DataGrid의 `T extends { id: string }`
 * 제약을 client-side `${label}-${index}` 합성 id 주입으로 해소. 통계 그리드는
 * 행 편집·저장 없는 조회 전용이라 id 충돌 위험 없음.
 */
export function StatsByCompanyGrid({ rows }: { rows: StatsRow[] }) {
  const t = useTranslations("Maintenance.Stats.columns");

  const tableRows = useMemo<Row[]>(
    () => rows.map((r, i) => ({ ...r, id: `${r.label}-${i}` })),
    [rows],
  );

  const COLUMNS = useMemo<ColumnDef<Row>[]>(
    () => [
      { key: "label", label: t("companyName"), type: "readonly" },
      { key: "cnt", label: t("cnt"), type: "numeric", width: 80, integer: true },
      {
        key: "workTime",
        label: t("workTime"),
        type: "readonly",
        width: 96,
        render: (r) => <span className="block text-right">{r.workTime.toFixed(0)}</span>,
      },
      { key: "rankingTime", label: t("rankingTime"), type: "numeric", width: 96, integer: true },
      { key: "rankingCnt", label: t("rankingCnt"), type: "numeric", width: 96, integer: true },
      {
        key: "finalRank",
        label: t("finalRank"),
        type: "readonly",
        width: 96,
        render: (r) => (
          <span
            className={
              "block text-right " +
              (r.finalRank <= 3
                ? "rounded bg-(--color-danger-subtle) px-1.5 font-semibold text-(--color-danger)"
                : "")
            }
          >
            {r.finalRank}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <DataGrid<Row>
      rows={tableRows}
      total={tableRows.length}
      columns={COLUMNS}
      filters={[]}
      page={1}
      limit={10000}
      makeBlankRow={() => ({} as Row)}
      readOnly
      emptyMessage={t("empty")}
      onPageChange={() => {}}
      onFilterChange={() => {}}
      onSave={async () => ({ ok: true })}
    />
  );
}
