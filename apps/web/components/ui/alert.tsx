import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const alertVariants = {
  default: "bg-blue-50 border-blue-200 text-blue-900",
  destructive: "bg-rose-50 border-rose-200 text-rose-900",
} as const;

export function Alert({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof alertVariants;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-lg border p-4",
        alertVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm leading-relaxed", className)} {...props} />
  );
}

export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />
  );
}
