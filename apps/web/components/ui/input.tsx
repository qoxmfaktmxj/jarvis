import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Input — ISU Brand Design System
 * Focus ring uses ISU blue, border tinted toward brand.
 */
export function Input({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-all duration-150 placeholder:opacity-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      style={{
        borderColor: "var(--border-strong)",
        color: "var(--surface-900)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--isu-400)";
        e.currentTarget.style.boxShadow = "0 0 0 3px var(--isu-100)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
      {...props}
    />
  );
}
