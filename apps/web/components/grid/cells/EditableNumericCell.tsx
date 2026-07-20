"use client";

export function EditableNumericCell(props: { value: number; onCommit: (value: number) => void }) {
  return <input type="number" defaultValue={props.value} onBlur={(event) => props.onCommit(Number(event.target.value || 0))} className="h-9 w-full rounded-md border border-[var(--border-default)] px-2" />;
}
