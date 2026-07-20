"use client";

export function EditableBooleanCell(props: { value: boolean; onCommit: (value: boolean) => void }) {
  return <input type="checkbox" defaultChecked={props.value} onChange={(event) => props.onCommit(event.target.checked)} className="h-4 w-4" />;
}
