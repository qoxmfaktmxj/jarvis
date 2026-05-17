"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { ColumnDef, FilterDef, GridSaveResult } from "@/components/grid/types";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";

type MasterRow = LeaveSummaryRow & { id: string };

interface Props {
  rows: LeaveSummaryRow[];
  selectedId: string | null;
  onSelect: (contractId: string | null) => void;
}

export function LeaveMasterGridContainer({ rows, selectedId, onSelect }: Props) {
  const t = useTranslations("Contractors.leaves.master");

  const masterRows = useMemo<MasterRow[]>(
    () => rows.map((r) => ({ ...r, id: r.contractId })),
    [rows],
  );

  const columns = useMemo<ColumnDef<MasterRow>[]>(
    () => [
      { key: "employeeId", label: t("columns.employeeId"), type: "text", width: 90, editable: false },
      { key: "name", label: t("columns.name"), type: "text", width: 100, editable: false },
      { key: "contractStartDate", label: t("columns.contractStart"), type: "date", width: 110, editable: false },
      { key: "contractEndDate", label: t("columns.contractEnd"), type: "date", width: 110, editable: false },
      { key: "generatedDays", label: t("columns.generated"), type: "numeric", width: 70, editable: false },
      { key: "usedDays", label: t("columns.used"), type: "numeric", width: 70, editable: false },
      { key: "remainingDays", label: t("columns.remaining"), type: "numeric", width: 70, editable: false },
      { key: "note", label: t("columns.note"), type: "text", width: 200, editable: false },
    ],
    [t],
  );

  const filters: FilterDef<MasterRow>[] = [];

  const handleNoopSave = useCallback(
    async (): Promise<GridSaveResult> => ({ ok: true }),
    [],
  );

  return (
    <DataGrid<MasterRow>
      rows={masterRows}
      columns={columns}
      filters={filters}
      page={1}
      limit={Math.max(masterRows.length, 1)}
      total={masterRows.length}
      onPageChange={() => {}}
      onFilterChange={() => {}}
      onSave={handleNoopSave}
      makeBlankRow={() => ({ ...({} as MasterRow), id: "" })}
      selectedId={selectedId}
      onSelect={onSelect}
      readOnly
      hideToolbar
      emptyMessage={t("empty")}
    />
  );
}
