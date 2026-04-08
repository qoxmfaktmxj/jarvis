"use client";

import { type ReactNode, useEffect, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange?.(false)}
      />
      {children}
    </div>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-50 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 mb-4", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold text-gray-900", className)}
      {...props}
    />
  );
}

export function DialogClose({
  children,
  asChild,
  className,
  ...props
}: {
  children?: ReactNode;
  asChild?: boolean;
  className?: string;
} & HTMLAttributes<HTMLButtonElement>) {
  if (asChild && children) {
    return <>{children}</>;
  }
  return (
    <button
      type="button"
      className={cn("absolute right-4 top-4 text-gray-400 hover:text-gray-600", className)}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function DialogTrigger({
  children,
  asChild,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  // DialogTrigger is typically used alongside a controlled Dialog (open/onOpenChange).
  // Here we render the child element as-is; the parent controls open state.
  if (asChild) {
    return <>{children}</>;
  }
  return <>{children}</>;
}

export function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex justify-end gap-2 mt-4", className)}
      {...props}
    />
  );
}
