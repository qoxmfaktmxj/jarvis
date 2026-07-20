"use client";

export function EditableTextAreaCell(props: { value: string; onCommit: (value: string) => void }) {
  return <textarea defaultValue={props.value} onBlur={(event) => props.onCommit(event.target.value)} className="min-h-24 w-full rounded-md border border-[var(--border-default)] px-2 py-2" />;
}
