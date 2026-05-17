"use client";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef } from "@/components/grid/types";
import type { StatsCombinedRow } from "@jarvis/shared/validation/service-desk";

type Row = StatsCombinedRow & { id: string };

/**
 * 담당자×회사 결합 통계 그리드 (read-only).
 * 합성 id: `${managerNm}-${requestCompanyNm ?? "T"}-${index}`.
 * 회사 == null인 subtotal 행은 셀 render에서 italic 라벨로 표시.
 */
export function StatsCombinedGrid({ rows }: { rows: StatsCombinedRow[] }) {
  const t = useTranslations("Maintenance.Stats.columns");

  const tableRows = useMemo<Row[]>(
    () =>
      rows.map((r, i) => ({
        ...r,
        id: `${r.managerNm ?? ""}-${r.requestCompanyNm ?? "T"}-${i}`,
      })),
    [rows],
  );

  const COLUMNS = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        key: "managerNm",
        label: t("managerName"),
        type: "readonly",
        render: (r) => <span>{r.managerNm ?? "-"}</span>,
      },
      {
        key: "requestCompanyNm",
        label: t("companyName"),
        type: "readonly",
        render: (r) =>
          r.requestCompanyNm !== null ? (
            <span>{r.requestCompanyNm}</span>
          ) : (
            <span className="italic text-(--fg-muted)">{t("subtotal")}</span>
          ),
      },
      { key: "cnt", label: t("cnt"), type: "numeric", width: 80, integer: true },
      {
        key: "workTime",
        label: t("workTime"),
        type: "readonly",
        width: 96,
        render: (r) => <span className="block text-right">{r.workTime.toFixed(0)}</span>,
      },
      {
        key: "total",
        label: t("total"),
        type: "readonly",
        width: 96,
        render: (r) => <span className="block text-right">{r.total.toFixed(2)}</span>,
      },
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
