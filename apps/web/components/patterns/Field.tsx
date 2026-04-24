import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  span?: 1 | 2;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, span = 1, error, className, children }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5 min-w-0", span === 2 && "md:col-span-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
        {label}
      </span>
      {children}
      {error && (
        <span className="text-[11px] font-medium text-[--color-red-500]">{error}</span>
      )}
    </label>
  );
}
