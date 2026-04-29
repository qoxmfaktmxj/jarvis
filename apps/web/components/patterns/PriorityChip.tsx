import * as React from "react";
import { cn } from "@/lib/utils";

export type PriorityKey = "P1" | "P2" | "P3";

const PRIORITY_STYLE: Record<PriorityKey, string> = {
  P1: "bg-(--color-red-50) text-(--color-red-500) border border-(--color-red-200)",
  P2: "bg-(--color-orange-50) text-(--color-orange)",
  P3: "bg-(--bg-surface) text-(--fg-secondary)",
};

export interface PriorityChipProps {
  priority: PriorityKey;
  className?: string;
}

export function PriorityChip({ priority, className }: PriorityChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold",
        "text-[9.5px] px-1.5 py-0.5 uppercase tracking-[0.08em]",
        PRIORITY_STYLE[priority],
        className,
      )}
    >
      {priority}
    </span>
  );
}
