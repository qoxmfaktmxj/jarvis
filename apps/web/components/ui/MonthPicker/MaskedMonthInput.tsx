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

export type MaskedMonthInputHandle = {
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

const ISO_RE = /^(\d{4})-(\d{2})$/;

function sanitize(raw: string): string {
  // accept "yyyymm" or "yyyy-mm" or partial; emit "yyyy-mm" up to typed length
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  let out = digits.slice(0, 4);
  if (digits.length === 4) out += "-";
  if (digits.length > 4) {
    let mm = digits.slice(4, 6);
    if (mm.length === 1 && Number(mm) > 1) mm = "0" + mm;
    if (mm.length === 2) {
      const n = Number(mm);
      if (n < 1 || n > 12) mm = mm.slice(0, 1);
    }
    out += "-" + mm;
  }
  return out;
}

function parseFull(text: string): string | null {
  const m = text.match(ISO_RE);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

export const MaskedMonthInput = forwardRef<MaskedMonthInputHandle, Props>(
  function MaskedMonthInput(
    { value, onCommit, onArrowDown, disabled, placeholder = "yyyy-mm", className, ariaLabel, ariaInvalid },
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
      setDraft(sanitize(raw));
    };

    const handleBlur = () => {
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
      if (/^\d{6}$/.test(text) || ISO_RE.test(text)) {
        e.preventDefault();
        setDraft(sanitize(text));
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
          "h-8 w-full bg-transparent px-2 text-[13px] text-(--fg-primary) outline-none",
          "focus:ring-2 focus:ring-notion-blue focus:ring-inset",
          ariaInvalid && "ring-1 ring-(--color-danger) ring-inset",
          className,
        )}
      />
    );
  },
);
