"use client";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef } from "@/components/grid/types";
import type { StatsRow } from "@jarvis/shared/validation/service-desk";

type Row = StatsRow & { id: string };

/**
 * 담당자별 유지보수 통계 그리드 (read-only).
 * id 합성 + DataGrid readOnly 패턴은 StatsByCompanyGrid 참조.
 */
export function StatsByManagerGrid({ rows }: { rows: StatsRow[] }) {
  const t = useTranslations("Maintenance.Stats.columns");

  const tableRows = useMemo<Row[]>(
    () => rows.map((r, i) => ({ ...r, id: `${r.label}-${i}` })),
    [rows],
  );

  const COLUMNS = useMemo<ColumnDef<Row>[]>(
    () => [
      { key: "label", label: t("managerName"), type: "readonly" },
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
