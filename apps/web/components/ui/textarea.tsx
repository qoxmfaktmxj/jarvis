import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[76px] w-full rounded-md border border-(--border-default) bg-(--bg-page) px-3 py-2 text-[13px] text-(--fg-primary) " +
          "shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-colors leading-relaxed " +
          "placeholder:text-(--fg-muted) " +
          "focus:border-(--brand-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-primary-bg) " +
          "disabled:opacity-60 disabled:cursor-not-allowed resize-y",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
