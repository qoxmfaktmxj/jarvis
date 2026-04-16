import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge — ISU Brand Design System
 * Uses brand-tinted OKLCH colors for all variants.
 */
const badgeInlineStyles: Record<string, React.CSSProperties> = {
  default: {
    background: "var(--isu-100)",
    color: "var(--isu-700)",
  },
  secondary: {
    background: "var(--surface-100)",
    color: "var(--surface-600)",
  },
  success: {
    background: "var(--success-subtle)",
    color: "oklch(0.40 0.12 145)",
  },
  warning: {
    background: "var(--warning-subtle)",
    color: "oklch(0.45 0.12 75)",
  },
  destructive: {
    background: "var(--destructive-subtle)",
    color: "oklch(0.45 0.15 25)",
  },
  outline: {
    background: "white",
    border: "1px solid var(--border-strong)",
    color: "var(--surface-600)",
  },
  accent: {
    background: "var(--lime-100)",
    color: "var(--lime-700)",
  },
};

export function Badge({
  className,
  variant = "default",
  style: externalStyle,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof badgeInlineStyles;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        className
      )}
      style={{ ...badgeInlineStyles[variant], ...externalStyle }}
      {...props}
    />
  );
}
