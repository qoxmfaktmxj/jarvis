"use client";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string | null) => void;
  invalid?: boolean;
  required?: boolean;
};

export function EditableTextAreaCell({
  value,
  placeholder,
  onCommit,
  invalid,
  required,
}: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    setEditing(false);
    const next = draft || null;
    if (next !== value) onCommit(next);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value ?? "");
      setEditing(false);
    }
    // plain Enter: default behavior (insert newline)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "flex h-full w-full items-start px-2 py-1 text-left text-[13px] text-(--fg-primary)",
          "hover:bg-(--bg-surface)/60",
          invalid && "ring-1 ring-rose-500 ring-inset",
        )}
      >
        {value ? (
          <span className="line-clamp-3 whitespace-pre-wrap break-words">{value}</span>
        ) : (
          <span className="text-(--fg-muted)">{placeholder ?? ""}</span>
        )}
        {required && !value && <span className="ml-1 shrink-0 text-rose-500">*</span>}
      </button>
    );
  }
  return (
    <textarea
      ref={ref}
      rows={3}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      className="h-full w-full resize-none bg-(--bg-page) px-2 py-1 text-[13px] text-(--fg-primary) outline-none ring-2 ring-(--border-focus) ring-inset transition-shadow duration-150"
    />
  );
}
