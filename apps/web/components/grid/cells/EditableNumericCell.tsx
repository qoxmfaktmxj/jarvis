"use client";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
  align?: "left" | "right" | "center";
  readOnly?: boolean;
  className?: string;
};

export function EditableNumericCell({
  value,
  onChange,
  align = "right",
  readOnly,
  className,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.replace(/,/g, "").trim();
    if (trimmed === "") {
      onChange(null);
    } else if (/^-?\d+$/.test(trimmed)) {
      onChange(Number(trimmed));
    }
    // invalid → no onChange (revert silently)
    setEditing(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") {
      setDraft(value === null ? "" : String(value));
      setEditing(false);
    }
  }

  if (editing && !readOnly) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className={cn(
          "w-full px-2 py-1 text-[13px] outline-none ring-2 ring-blue-500 ring-inset",
          className,
        )}
      />
    );
  }

  return (
    <div
      onClick={() => {
        if (!readOnly) {
          setDraft(value === null ? "" : String(value));
          setEditing(true);
        }
      }}
      className={cn(
        "px-2 py-1 text-[13px]",
        !readOnly && "cursor-pointer",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {value === null ? "" : value.toLocaleString("ko-KR")}
    </div>
  );
}
