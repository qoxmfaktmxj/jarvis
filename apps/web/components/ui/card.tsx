import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Card — ISU Brand Design System
 * No heavy shadows. Subtle border with brand-tinted surface.
 * Clean separation via spacing, not visual weight.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white/80 backdrop-blur-[2px]",
        className
      )}
      style={{
        borderColor: "var(--border)",
      }}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 px-5 py-4",
        className
      )}
      style={{ borderBottom: "1px solid var(--surface-100)" }}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-display text-sm font-semibold", className)}
      style={{ color: "var(--surface-900)" }}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-5 py-4", className)}
      style={{ borderTop: "1px solid var(--surface-100)" }}
      {...props}
    />
  );
}
