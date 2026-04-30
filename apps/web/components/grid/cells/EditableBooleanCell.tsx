"use client";

type Props = {
  value: boolean;
  onCommit: (next: boolean) => void;
};

export function EditableBooleanCell({ value, onCommit }: Props) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onCommit(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
      />
    </div>
  );
}
