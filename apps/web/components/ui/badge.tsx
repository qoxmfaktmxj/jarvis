import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.125px]",
  {
    variants: {
      variant: {
        default:     "bg-(--brand-primary) text-white",
        secondary:   "bg-(--bg-surface) text-(--fg-primary)",
        destructive: "bg-(--color-red-50) text-(--color-red-500) border border-(--color-red-200)",
        outline:     "bg-transparent text-(--fg-primary) border border-(--border-default)",
        success:     "bg-(--status-done-bg) text-(--status-done-fg)",
        warning:     "bg-(--status-warn-bg) text-(--status-warn-fg)",
        info:        "bg-(--status-active-bg) text-(--status-active-fg)",
        // DEPRECATED: Phase 2에서 전 호출부 제거 예정
        accent:      "bg-(--brand-primary) text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
