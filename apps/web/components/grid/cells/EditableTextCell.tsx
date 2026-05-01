"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string | null) => void;
  invalid?: boolean;
  required?: boolean;
};

export function EditableTextCell({ value, placeholder, onCommit, invalid, required }: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "flex h-full w-full items-center px-2 text-left text-[13px] text-(--fg-primary)",
          "hover:bg-(--bg-surface)/60",
          invalid && "ring-1 ring-rose-500 ring-inset",
        )}
      >
        {value ? (
          <span className="truncate">{value}</span>
        ) : (
          <span className="text-(--fg-muted)">{placeholder ?? ""}</span>
        )}
        {required && !value && <span className="ml-1 shrink-0 text-rose-500">*</span>}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft || null;
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      className="h-full w-full bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) outline-none ring-2 ring-(--border-focus) ring-inset transition-shadow duration-150"
    />
  );
}
