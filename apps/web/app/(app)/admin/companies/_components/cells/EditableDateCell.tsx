"use client";

type Props = {
  value: string | null;
  onCommit: (next: string | null) => void;
};

export function EditableDateCell({ value, onCommit }: Props) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      className="h-full w-full bg-transparent px-2 text-[13px] text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-shadow duration-150"
    />
  );
}
