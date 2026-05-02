"use client";
import { useTranslations } from "next-intl";
import { DatePicker } from "@/components/ui/DatePicker";

export interface DetailRow {
  id: string;               // existing row id or `_tmp_<n>`
  status: "active" | "cancelled";
  type: string;             // annual/halfAm/...
  appliedAt: string | null; // iso or null for new rows
  requestStatus: string;    // approved/pending/rejected
  startDate: string;
  endDate: string;
  hours: number;
  reason: string | null;
  dirty: boolean;           // true for new/edited rows
  markedForCancel: boolean;
}

export function LeaveDetailTable({
  rows,
  disabled,
  onAdd,
  onSave,
  onRowChange,
  onToggleCancel
}: {
  rows: DetailRow[];
  disabled: boolean;
  onAdd: () => void;
  onSave: () => void;
  onRowChange: (id: string, patch: Partial<DetailRow>) => void;
  onToggleCancel: (id: string, next: boolean) => void;
}) {
  const t = useTranslations("Contractors.leaves.detail");
  const anyDirty = rows.some((r) => r.dirty || r.markedForCancel);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="rounded border border-surface-300 bg-card px-3 py-1 text-xs disabled:opacity-50"
        >
          {t("actions.add")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || !anyDirty}
          className="rounded bg-isu-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {t("actions.save")}
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-surface-200">
        <table className="w-full text-xs">
          <thead className="bg-surface-50 text-surface-600">
            <tr>
              <th className="px-2 py-1 text-right">{t("columns.no")}</th>
              <th className="px-2 py-1">{t("columns.delete")}</th>
              <th className="px-2 py-1">{t("columns.status")}</th>
              <th className="px-2 py-1">{t("columns.type")}</th>
              <th className="px-2 py-1">{t("columns.appliedAt")}</th>
              <th className="px-2 py-1">{t("columns.requestStatus")}</th>
              <th className="px-2 py-1">{t("columns.startDate")}</th>
              <th className="px-2 py-1">{t("columns.endDate")}</th>
              <th className="px-2 py-1 text-right">{t("columns.days")}</th>
              <th className="px-2 py-1">{t("columns.reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isNew = r.id.startsWith("_tmp_");
              const rowClass = r.markedForCancel
                ? "bg-danger-subtle/40"
                : r.dirty
                  ? "bg-warning-subtle/40"
                  : "";
              return (
                <tr key={r.id} className={rowClass}>
                  <td className="px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                  <td className="px-2 py-1 text-center">
                    {!isNew && (
                      <input
                        type="checkbox"
                        checked={r.markedForCancel}
                        disabled={disabled}
                        onChange={(e) => onToggleCancel(r.id, e.target.checked)}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1">{r.status}</td>
                  <td className="px-2 py-1">
                    {isNew ? (
                      <select
                        value={r.type}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { type: e.target.value })
                        }
                        className="rounded border px-1"
                      >
                        <option value="annual">annual</option>
                        <option value="halfAm">halfAm</option>
                        <option value="halfPm">halfPm</option>
                        <option value="sick">sick</option>
                        <option value="family">family</option>
                      </select>
                    ) : (
                      r.type
                    )}
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    {r.appliedAt?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-2 py-1">{r.requestStatus}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {isNew ? (
                      <DatePicker
                        value={r.startDate || null}
                        disabled={disabled}
                        onChange={(v) =>
                          onRowChange(r.id, { startDate: v ?? "" })
                        }
                      />
                    ) : (
                      r.startDate
                    )}
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    {isNew ? (
                      <DatePicker
                        value={r.endDate || null}
                        disabled={disabled}
                        onChange={(v) =>
                          onRowChange(r.id, { endDate: v ?? "" })
                        }
                      />
                    ) : (
                      r.endDate
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {isNew ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={r.hours}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, {
                            hours: Number(e.target.value)
                          })
                        }
                        className="w-16 rounded border px-1 text-right"
                      />
                    ) : (
                      (r.hours / 8).toFixed(2)
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {isNew ? (
                      <input
                        type="text"
                        value={r.reason ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { reason: e.target.value })
                        }
                        className="w-full rounded border px-1"
                      />
                    ) : (
                      r.reason ?? ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
