"use client";
import type { FilterDef } from "./types";

type Props<T> = {
  filters: FilterDef<T>[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Column count for leading empty cells (no, delete, status) */
  leadingCols?: number;
  /** Column count for trailing empty cells after filter columns */
  trailingCols?: number;
};

export function ColumnFilterRow<T extends { id: string }>({
  filters,
  values,
  onChange,
  leadingCols = 3,
  trailingCols = 0,
}: Props<T>) {
  return (
    <tr className="border-b border-(--border-default) bg-(--bg-surface) text-xs text-(--fg-secondary)">
      {Array.from({ length: leadingCols }).map((_, i) => (
        <td key={`lead-${i}`} className="px-2 py-1" />
      ))}
      {filters.map((f) => (
        <td key={String(f.key)} className="px-2 py-1">
          {f.type === "select" ? (
            <select
              className="w-full bg-transparent outline-none focus:bg-(--bg-page) focus:ring-1 focus:ring-(--border-focus) focus:ring-inset"
              value={values[String(f.key)] ?? ""}
              onChange={(e) =>
                onChange({ ...values, [String(f.key)]: e.target.value })
              }
            >
              <option value="">전체</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full bg-transparent outline-none focus:bg-(--bg-page) focus:ring-1 focus:ring-(--border-focus) focus:ring-inset"
              placeholder={f.placeholder ?? ""}
              value={values[String(f.key)] ?? ""}
              onChange={(e) =>
                onChange({ ...values, [String(f.key)]: e.target.value })
              }
            />
          )}
        </td>
      ))}
      {Array.from({ length: trailingCols }).map((_, i) => (
        <td key={`trail-${i}`} className="px-2 py-1" />
      ))}
      {/* status badge col */}
      <td className="px-2 py-1" />
    </tr>
  );
}
