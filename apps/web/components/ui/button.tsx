"use client";

import type { ButtonHTMLAttributes } from "react";

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

const variantStyles = {
  default:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:text-white",
  secondary:
    "bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
} as const;

const sizeStyles = {
  default: "h-10 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
  icon: "h-8 w-8"
} as const;

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}) {
  return (
    <button
      type={type}
      className={joinClassNames(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
