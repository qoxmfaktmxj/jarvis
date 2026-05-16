"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MaskedMonthInput, type MaskedMonthInputHandle } from "./MaskedMonthInput";
import { MonthGridPopup } from "./MonthGridPopup";

export type MonthPickerProps = {
  /** ISO yyyy-mm or null */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** ISO yyyy-mm */
  min?: string;
  /** ISO yyyy-mm */
  max?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

/**
 * Month input following the Jarvis standard input component policy.
 *
 * Sister of {@link DatePicker} that emits `yyyy-mm` (no day component).
 * Replaces native `<input type="month">` which is forbidden by harness rules
 * (한국 IME 자릿수 분할 깨짐 + 키보드 네비게이션 불가).
 *
 * Value semantics:
 * - `value`: ISO `yyyy-mm` string (e.g. `"2026-05"`) or `null`
 * - Pasting `yyyymm` (6 digits) or `yyyy-mm` is auto-normalized
 */
export function MonthPicker({
  value, onChange, disabled, min, max, placeholder, className, ariaLabel,
}: MonthPickerProps) {
  const t = useTranslations("Common.Calendar");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MaskedMonthInputHandle>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className={cn("relative inline-flex h-8 items-center rounded-md border border-(--border-default) bg-(--bg-page)", className)}>
      <MaskedMonthInput
        ref={inputRef}
        value={value}
        onCommit={onChange}
        onArrowDown={() => setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
      <button
        type="button"
        aria-label={t("openCalendar")}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-8 items-center justify-center text-(--fg-secondary) hover:text-(--fg-primary) disabled:cursor-not-allowed"
      >
        <Calendar size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1">
          <MonthGridPopup
            value={value}
            min={min}
            max={max}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
              inputRef.current?.focus();
            }}
            onClose={() => {
              setOpen(false);
              inputRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
