"use client";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";

export function LeaveMasterTable({
  rows,
  selectedId,
  onSelect
}: {
  rows: LeaveSummaryRow[];
  selectedId: string | null;
  onSelect: (contractId: string) => void;
}) {
  const t = useTranslations("Contractors.leaves.master.columns");
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200">
      <table className="w-full text-xs">
        <thead className="bg-surface-50 text-surface-600">
          <tr>
            <th className="px-2 py-1 text-right">{t("no")}</th>
            <th className="px-2 py-1 text-left">{t("employeeId")}</th>
            <th className="px-2 py-1 text-left">{t("name")}</th>
            <th className="px-2 py-1 text-left">{t("contractStart")}</th>
            <th className="px-2 py-1 text-left">{t("contractEnd")}</th>
            <th className="px-2 py-1 text-right">{t("generated")}</th>
            <th className="px-2 py-1 text-right">{t("used")}</th>
            <th className="px-2 py-1 text-right">{t("remaining")}</th>
            <th className="px-2 py-1 text-left">{t("note")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const selected = r.contractId === selectedId;
            return (
              <tr
                key={r.contractId}
                onClick={() => onSelect(r.contractId)}
                className={
                  selected
                    ? "cursor-pointer bg-isu-50"
                    : "cursor-pointer hover:bg-surface-50"
                }
              >
                <td className="px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                <td className="px-2 py-1">{r.employeeId}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 tabular-nums">{r.contractStartDate}</td>
                <td className="px-2 py-1 tabular-nums">{r.contractEndDate}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.generatedDays.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.usedDays.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.remainingDays.toFixed(2)}
                </td>
                <td className="max-w-[240px] truncate px-2 py-1 text-surface-600">
                  {r.note ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
