"use client";

export function EditableTextCell(props: { value: string; onCommit: (value: string) => void }) {
  return <input defaultValue={props.value} onBlur={(event) => props.onCommit(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border-default)] px-2" />;
}
