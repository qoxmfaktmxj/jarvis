"use client";

/**
 * YnSelectFilter — Y/N filter dropdown for grid search panels.
 *
 * Wraps a native `<select>` matching the Input height/border tokens used by
 * other grid filter controls. Empty value = "all".
 *
 * Use inside GridFilterField:
 *   <GridFilterField label={t("filters.outYn")} className="w-[100px]">
 *     <YnSelectFilter
 *       value={pending.outYn}
 *       onChange={(v) => setPending("outYn", v)}
 *       allLabel={common("filters.all")}
 *     />
 *   </GridFilterField>
 */
export function YnSelectFilter({
  value,
  onChange,
  allLabel,
  yLabel = "Y",
  nLabel = "N",
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  allLabel: string;
  yLabel?: string;
  nLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-8 w-full rounded-md border border-(--line) bg-(--bg-page) px-2 text-[13px] text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus) disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">{allLabel}</option>
      <option value="Y">{yLabel}</option>
      <option value="N">{nLabel}</option>
    </select>
  );
}
