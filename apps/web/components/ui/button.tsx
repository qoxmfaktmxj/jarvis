"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — Notion-aligned Design System (Phase 1 retune)
 * Primary: Notion Blue (--brand-primary). accent variant: DEPRECATED alias for default.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:   "bg-(--brand-primary) text-white shadow-[var(--shadow-flat)] hover:bg-(--brand-primary-hover) focus-visible:ring-2 focus-visible:ring-(--border-focus) focus-visible:ring-offset-2",
        secondary: "bg-(--bg-surface) text-(--fg-primary) border border-(--border-default) hover:bg-white hover:border-[rgba(0,0,0,0.16)]",
        ghost:     "bg-transparent text-(--fg-primary) hover:bg-(--bg-surface)",
        outline:   "bg-(--bg-page) border border-(--border-default) text-(--fg-primary) hover:bg-(--bg-surface)",
        danger:    "bg-transparent text-(--color-red-500) hover:bg-(--color-red-50)",
        link:      "text-(--brand-primary-text) underline-offset-2 hover:underline bg-transparent",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // DEPRECATED: Phase 2에서 전 호출부 제거 예정
        accent:    "bg-(--brand-primary) text-white shadow-[var(--shadow-flat)] hover:bg-(--brand-primary-hover) focus-visible:ring-2 focus-visible:ring-(--border-focus) focus-visible:ring-offset-2",
      },
      size: {
        default: "h-9 px-4 py-2 text-[14px]",
        sm:      "h-8 px-3 text-[12.5px]",
        lg:      "h-10 px-5 text-[15px]",
        icon:    "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

/**
 * Back-compat wrapper for legacy consumers that used buttonClasses({...}).
 */
export function buttonClasses({
  className,
  variant = "default",
  size = "default",
}: {
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}) {
  return buttonVariants({ variant, size, className });
}

export { Button, buttonVariants };
