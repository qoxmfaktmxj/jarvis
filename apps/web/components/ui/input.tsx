import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-md border border-[--border-default] bg-[--bg-page] px-3 py-1.5 text-[13px] text-[--fg-primary] " +
          "shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-colors tabular-nums " +
          "placeholder:text-[--fg-muted] " +
          "focus:border-[--brand-primary] focus:outline-none focus:ring-2 focus:ring-[--brand-primary-bg] " +
          "disabled:opacity-60 disabled:cursor-not-allowed " +
          "file:border-0 file:bg-transparent file:text-[13px] file:font-medium",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
