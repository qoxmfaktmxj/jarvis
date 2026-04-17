import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-isu-100 text-isu-700",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        success:
          "border-transparent bg-success-subtle text-success",
        warning:
          "border-transparent bg-warning-subtle text-warning",
        destructive:
          "border-transparent bg-danger-subtle text-destructive",
        outline:
          "border-border bg-background text-foreground",
        accent:
          "border-transparent bg-lime-100 text-lime-700",
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
