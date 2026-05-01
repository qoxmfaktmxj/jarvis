"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

export type MaskedDateInputHandle = {
  focus: () => void;
  blur: () => void;
};

type Props = {
  value: string | null;
  onCommit: (next: string | null) => void;
  onArrowDown?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function sanitize(raw: string): string {
  // accept "yyyymmdd" or "yyyy-mm-dd" or partial; emit "yyyy-mm-dd" up to typed length
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 4);
  let mm = "";
  if (digits.length === 4) out += "-";
  if (digits.length > 4) {
    mm = digits.slice(4, 6);
    if (mm.length === 1 && Number(mm) > 1) mm = "0" + mm;
    if (mm.length === 2) {
      const n = Number(mm);
      if (n < 1 || n > 12) mm = mm.slice(0, 1);
    }
    out += "-" + mm;
    if (mm.length === 2) out += "-";
  }
  if (digits.length > 6 && mm.length === 2) {
    let dd = digits.slice(6, 8);
    if (dd.length === 1 && Number(dd) > 3) dd = "0" + dd;
    if (dd.length === 2) {
      const n = Number(dd);
      if (n < 1 || n > 31) dd = dd.slice(0, 1);
    }
    out = out.slice(0, "yyyy-mm-".length) + dd;
  }
  return out;
}

function parseFull(text: string): string | null {
  const m = text.match(ISO_RE);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // calendar correctness check
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== mo ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export const MaskedDateInput = forwardRef<MaskedDateInputHandle, Props>(
  function MaskedDateInput(
    { value, onCommit, onArrowDown, disabled, placeholder = "yyyy-mm-dd", className, ariaLabel, ariaInvalid },
    ref,
  ) {
    const [draft, setDraft] = useState(value ?? "");
    const inputRef = useRef<HTMLInputElement>(null);
    const escapePending = useRef(false);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }));

    useEffect(() => {
      setDraft(value ?? "");
    }, [value]);

    const handleChange = (raw: string) => {
      const next = sanitize(raw);
      setDraft(next);
    };

    const handleBlur = () => {
      // Escape key resets draft and triggers blur — skip commit in that case
      if (escapePending.current) {
        escapePending.current = false;
        return;
      }
      if (draft === "") {
        if (value !== null) onCommit(null);
        return;
      }
      const iso = parseFull(draft);
      if (iso === null) {
        // partial → null
        onCommit(null);
        setDraft("");
      } else if (iso !== value) {
        onCommit(iso);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        escapePending.current = true;
        setDraft(value ?? "");
        inputRef.current?.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        inputRef.current?.blur();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onArrowDown?.();
      }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text").trim();
      if (/^\d{8}$/.test(text) || ISO_RE.test(text)) {
        e.preventDefault();
        const next = sanitize(text);
        setDraft(next);
      }
    };

    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={cn(
          "h-8 w-full bg-transparent px-2 text-[13px] text-warm-900 outline-none",
          "focus:ring-2 focus:ring-notion-blue focus:ring-inset",
          ariaInvalid && "ring-1 ring-red-500 ring-inset",
          className,
        )}
      />
    );
  },
);
