import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusKey =
  | "neutral"
  | "todo"
  | "active"
  | "progress"
  | "review"
  | "done"
  | "success"
  | "warning"
  | "hold"
  | "danger"
  | "urgent"
  | "blocked"
  | "decorative-pink"
  | "decorative-purple"
  | "decorative-brown";

type StyleMap = { chip: string; dot: string };

const STATUS_STYLES: Record<StatusKey, StyleMap> = {
  neutral:              { chip: "bg-(--status-neutral-bg) text-(--status-neutral-fg)",                 dot: "bg-(--fg-muted)" },
  todo:                 { chip: "bg-(--status-neutral-bg) text-(--status-neutral-fg)",                 dot: "bg-(--fg-muted)" },
  active:               { chip: "bg-(--status-active-bg) text-(--status-active-fg)",                   dot: "bg-(--brand-primary)" },
  progress:             { chip: "bg-(--status-success-bg) text-(--status-success-fg)",                 dot: "bg-(--color-teal)" },
  review:               { chip: "bg-(--status-active-bg) text-(--status-active-fg)",                   dot: "bg-(--brand-primary)" },
  done:                 { chip: "bg-(--status-done-bg) text-(--status-done-fg)",                       dot: "bg-(--color-green)" },
  success:              { chip: "bg-(--status-success-bg) text-(--status-success-fg)",                 dot: "bg-(--color-teal)" },
  warning:              { chip: "bg-(--status-warn-bg) text-(--status-warn-fg)",                       dot: "bg-(--color-orange)" },
  hold:                 { chip: "bg-(--status-warn-bg) text-(--status-warn-fg)",                       dot: "bg-(--color-orange)" },
  danger:               { chip: "bg-(--status-danger-bg) text-(--status-danger-fg) border border-(--color-red-200)", dot: "bg-(--color-red-500)" },
  urgent:               { chip: "bg-(--status-danger-bg) text-(--status-danger-fg) border border-(--color-red-200)", dot: "bg-(--color-red-500)" },
  blocked:              { chip: "bg-(--status-danger-bg) text-(--status-danger-fg) border border-(--color-red-200)", dot: "bg-(--color-red-500)" },
  "decorative-pink":    { chip: "bg-(--status-decorative-pink-bg) text-(--status-decorative-pink-fg)",     dot: "bg-(--color-pink)" },
  "decorative-purple":  { chip: "bg-(--status-decorative-purple-bg) text-(--status-decorative-purple-fg)", dot: "bg-(--color-purple)" },
  "decorative-brown":   { chip: "bg-(--status-decorative-brown-bg) text-(--status-decorative-brown-fg)",   dot: "bg-(--color-brown)" },
};

export const STATUS_LABELS: Record<StatusKey, string> = {
  neutral: "대기",
  todo: "할 일",
  active: "진행 중",
  progress: "진행 중",
  review: "리뷰",
  done: "완료",
  success: "성공",
  warning: "주의",
  hold: "보류",
  danger: "위험",
  urgent: "긴급",
  blocked: "차단",
  "decorative-pink": "고객",
  "decorative-purple": "관리",
  "decorative-brown": "아카이브",
};

export type StatusChipSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<StatusChipSize, string> = {
  sm: "text-[10.5px] px-2 py-0.5 gap-1",    // T3 기본
  md: "text-[11px] px-2 py-0.5 gap-1",       // T2
  lg: "text-[12px] px-2.5 py-0.5 gap-1.5 tracking-[0.125px]", // T1
};

export interface StatusChipProps {
  status: StatusKey;
  label?: string;
  size?: StatusChipSize;
  dot?: boolean;
  className?: string;
}

export function StatusChip({ status, label, size = "sm", dot = true, className }: StatusChipProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.neutral;
  const text = label ?? STATUS_LABELS[status] ?? String(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        SIZE_CLASS[size],
        style.chip,
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />}
      {text}
    </span>
  );
}
