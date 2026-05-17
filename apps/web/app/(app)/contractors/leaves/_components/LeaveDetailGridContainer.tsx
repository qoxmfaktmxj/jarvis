"use client";

import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type {
  ColumnDef,
  FilterDef,
  GridChanges,
  GridSaveResult,
} from "@/components/grid/types";
import type { LeaveRequestRow } from "@/app/(app)/contractors/leaves/actions";
import { saveLeaveBatch } from "@/app/(app)/contractors/leaves/actions";

const LEAVE_TYPES = [
  "annual",
  "halfAm",
  "halfPm",
  "hourly",
  "sick",
  "family",
] as const;

interface Props {
  contractId: string | null;
  rows: LeaveRequestRow[];
  onSaved: () => void;
  disabled?: boolean;
}

export function LeaveDetailGridContainer({
  contractId,
  rows,
  onSaved,
  disabled,
}: Props) {
  const t = useTranslations("Contractors.leaves.detail");
  const tType = useTranslations("Contractors.leaves.detail.types");
  const tStatus = useTranslations("Contractors.leaves.detail.status");
  const tReq = useTranslations("Contractors.leaves.detail.requestStatus");

  const gridApiRef = useRef<{ discardChanges: () => void } | null>(null);

  const columns = useMemo<ColumnDef<LeaveRequestRow>[]>(
    () => [
      {
        key: "status",
        label: t("columns.status"),
        type: "select",
        width: 80,
        editable: false,
        options: [
          { value: "active", label: tStatus("active") },
          { value: "cancelled", label: tStatus("cancelled") },
        ],
      },
      {
        key: "type",
        label: t("columns.type"),
        type: "select",
        width: 100,
        editable: true,
        lockOnExisting: true,
        options: LEAVE_TYPES.map((v) => ({ value: v, label: tType(v) })),
      },
      {
        key: "appliedAt",
        label: t("columns.appliedAt"),
        type: "date",
        width: 110,
        editable: false,
      },
      {
        key: "requestStatus",
        label: t("columns.requestStatus"),
        type: "select",
        width: 80,
        editable: false,
        options: [
          { value: "approved", label: tReq("approved") },
          { value: "pending", label: tReq("pending") },
          { value: "rejected", label: tReq("rejected") },
        ],
      },
      {
        key: "startDate",
        label: t("columns.startDate"),
        type: "date",
        width: 120,
        editable: true,
        lockOnExisting: true,
      },
      {
        key: "endDate",
        label: t("columns.endDate"),
        type: "date",
        width: 120,
        editable: true,
        lockOnExisting: true,
      },
      {
        key: "hours",
        label: t("columns.hours"),
        type: "numeric",
        width: 80,
        editable: true,
        lockOnExisting: true,
        integer: true,
      },
      {
        key: "reason",
        label: t("columns.reason"),
        type: "text",
        width: 240,
        editable: true,
        lockOnExisting: true,
      },
    ],
    [t, tType, tStatus, tReq],
  );

  const handleSave = useCallback(
    async (changes: GridChanges<LeaveRequestRow>): Promise<GridSaveResult> => {
      if (!contractId) {
        return { ok: false, errors: [{ message: t("toast.saveFailed") }] };
      }
      const inserts = changes.creates.map((r) => ({
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        hours: Number(r.hours),
        reason: r.reason ?? "",
      }));
      const cancels = changes.deletes; // string[] (id list)
      try {
        const res = await saveLeaveBatch({ contractId, inserts, cancels });
        if (res.cancelFailed.length > 0) {
          return {
            ok: false,
            errors: [
              {
                message: t("toast.cancelFailed", {
                  ids: res.cancelFailed.join(", "),
                }),
              },
            ],
          };
        }
        onSaved();
        return { ok: true, created: res.inserted, deleted: res.cancelled };
      } catch {
        return { ok: false, errors: [{ message: t("toast.saveFailed") }] };
      }
    },
    [contractId, onSaved, t],
  );

  const makeBlankRow = useCallback(
    (): LeaveRequestRow => ({
      id: crypto.randomUUID(),
      type: "annual",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      hours: 8,
      reason: "",
      status: "active",
      appliedAt: new Date().toISOString(),
      cancelledAt: null,
      requestStatus: "approved",
    }),
    [],
  );

  const filters: FilterDef<LeaveRequestRow>[] = [];

  return (
    <DataGrid<LeaveRequestRow>
      rows={rows}
      columns={columns}
      filters={filters}
      page={1}
      limit={50}
      total={rows.length}
      onPageChange={() => {}}
      onFilterChange={() => {}}
      onSave={handleSave}
      makeBlankRow={makeBlankRow}
      onGridReady={(api) => {
        gridApiRef.current = api;
      }}
      readOnly={disabled === true || !contractId}
      allowCopy={false}
      emptyMessage={!contractId ? t("noSelection") : t("empty")}
    />
  );
}
