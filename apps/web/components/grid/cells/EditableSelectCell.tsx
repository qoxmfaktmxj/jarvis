"use client";

export function EditableSelectCell(props: {
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  onCommit: (value: string) => void;
}) {
  return (
    <select defaultValue={props.value} onChange={(event) => props.onCommit(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border-default)] px-2">
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
