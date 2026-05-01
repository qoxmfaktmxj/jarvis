"use client";

type Option = { value: string; label: string };

type Props = {
  value: string | null;
  options: Option[];
  onCommit: (next: string | null) => void;
  required?: boolean;
};

export function EditableSelectCell({ value, options, onCommit, required }: Props) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      className="h-full w-full appearance-none bg-transparent px-2 text-[13px] text-(--fg-primary) outline-none focus:bg-(--bg-page) focus:ring-2 focus:ring-(--border-focus) focus:ring-inset transition-shadow duration-150"
    >
      {!required && <option value="">—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
