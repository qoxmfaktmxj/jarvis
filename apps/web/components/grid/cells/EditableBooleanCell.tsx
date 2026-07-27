"use client";

export function EditableBooleanCell(props: {
  value: boolean;
  onCommit: (value: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={props.value}
      onChange={(event) => props.onCommit(event.target.checked)}
      aria-label={props.ariaLabel}
      className="h-4 w-4 accent-[var(--brand-primary)]"
    />
  );
}
