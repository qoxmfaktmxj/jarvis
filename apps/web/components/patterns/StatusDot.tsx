import type { ReactNode } from "react";

export type StatusDotProps = {
  tone: "healthy" | "warning" | "danger" | "info" | "neutral";
  label?: ReactNode;
  size?: "sm" | "md";
};

const toneStyles: Record<StatusDotProps["tone"], { dot: string; text: string }> = {
  healthy: { dot: "bg-lime-500", text: "text-lime-700" },
  warning: { dot: "bg-warning", text: "text-warning" },
  danger: { dot: "bg-danger", text: "text-danger" },
  info: { dot: "bg-isu-500", text: "text-isu-700" },
  neutral: { dot: "bg-surface-400", text: "text-surface-600" },
};

const sizeStyles = {
  sm: { dot: "h-1.5 w-1.5", text: "text-xs" },
  md: { dot: "h-2 w-2", text: "text-sm" },
};

export function StatusDot({ tone, label, size = "sm" }: StatusDotProps) {
  const t = toneStyles[tone];
  const s = sizeStyles[size];
  return (
    <span className={`inline-flex items-center gap-1.5 ${t.text} ${s.text} font-medium`}>
      <span className={`${s.dot} ${t.dot} rounded-full`} aria-hidden />
      {label}
    </span>
  );
}
