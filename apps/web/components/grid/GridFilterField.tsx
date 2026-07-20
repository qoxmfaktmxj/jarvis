"use client";

export function GridFilterField(props: {
  name: string;
  defaultValue?: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <select name={props.name} defaultValue={props.defaultValue ?? ""} className="h-10 rounded-md border border-[var(--border-default)] px-3">
      <option value="">전체</option>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
