import * as React from "react";
import { cn } from "@/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<NativeSelectOption>;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function NativeSelect({
  value,
  onChange,
  options,
  compact = false,
  disabled = false,
  className,
  ariaLabel,
}: NativeSelectProps) {
  return (
    <div className={cn("relative", disabled && "opacity-60 pointer-events-none", className)}>
      <select
        aria-label={ariaLabel}
        className={cn(
          "flex w-full appearance-none rounded-md border border-[--border-default]",
          "bg-[--bg-page] pr-8 pl-3 text-[--fg-primary]",
          "shadow-[0_1px_2px_rgba(15,23,42,0.02)] tabular-nums",
          "focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg]",
          compact ? "h-7 text-[12px] min-w-[120px]" : "h-8 text-[13px]",
        )}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[--fg-muted]"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
