"use client";

import type { ButtonHTMLAttributes, ReactElement } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Button — ISU Brand Design System
 * Primary: ISU Blue. CTA accent: ISU Lime.
 * Uses CSS custom properties from globals.css.
 */
const variantStyles = {
  default:
    "text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed",
  outline:
    "bg-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
} as const;

const sizeStyles = {
  default: "h-10 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
  icon: "h-8 w-8"
} as const;

/* inline style overrides per variant — brand colors via OKLCH tokens */
const variantInlineStyles: Record<keyof typeof variantStyles, React.CSSProperties> = {
  default: {
    background: "var(--primary)",
  },
  secondary: {
    background: "var(--surface-100)",
    color: "var(--surface-800)",
  },
  ghost: {
    color: "var(--surface-700)",
  },
  outline: {
    border: "1px solid var(--border-strong)",
    color: "var(--surface-800)",
  },
};

export function buttonClasses({
  className,
  variant = "default",
  size = "default"
}: {
  className?: string;
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150",
    variantStyles[variant],
    sizeStyles[size],
    className
  );
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  asChild = false,
  style: externalStyle,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  asChild?: boolean;
}) {
  const classes = buttonClasses({ className, variant, size });
  const mergedStyle = { ...variantInlineStyles[variant], ...externalStyle };

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ className?: string; style?: React.CSSProperties }>, {
      className: cn(classes, (children as ReactElement<{ className?: string }>).props.className),
      style: mergedStyle,
    });
  }
  return (
    <button
      type={type}
      className={classes}
      style={mergedStyle}
      {...props}
    >
      {children}
    </button>
  );
}
