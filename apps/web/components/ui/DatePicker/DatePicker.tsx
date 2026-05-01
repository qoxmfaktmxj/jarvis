"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaskedDateInput, type MaskedDateInputHandle } from "./MaskedDateInput";
import { CalendarPopup } from "./CalendarPopup";

export type DatePickerProps = {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

export function DatePicker({
  value, onChange, disabled, min, max, placeholder, className, ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MaskedDateInputHandle>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className={cn("relative inline-flex h-8 items-center rounded-md border border-slate-200 bg-white", className)}>
      <MaskedDateInput
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
        aria-label="달력 열기"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-8 items-center justify-center text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed"
      >
        <Calendar size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1">
          <CalendarPopup
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
