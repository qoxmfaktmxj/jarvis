import type { HTMLAttributes } from "react";

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

const badgeStyles = {
  default: "bg-blue-100 text-blue-700",
  secondary: "bg-gray-100 text-gray-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  destructive: "bg-rose-100 text-rose-700"
} as const;

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof badgeStyles;
}) {
  return (
    <span
      className={joinClassNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        badgeStyles[variant],
        className
      )}
      {...props}
    />
  );
}
