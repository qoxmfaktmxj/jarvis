"use client";

import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover() {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error("Popover components must be used within <Popover>");
  return ctx;
}

export function Popover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  children,
  asChild,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const { open, setOpen } = usePopover();
  if (asChild) {
    return (
      <div onClick={() => setOpen(true)} className="contents" role="button" tabIndex={0} onKeyDown={() => setOpen(true)}>
        {children}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {children}
    </button>
  );
}

export function PopoverContent({
  children,
  className,
  side = "bottom",
  align = "center",
}: {
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const { open, setOpen } = usePopover();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  if (!open) return null;

  const sideClass =
    side === "top"
      ? "bottom-full mb-1"
      : side === "left"
      ? "right-full mr-1"
      : side === "right"
      ? "left-full ml-1"
      : "top-full mt-1";

  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 rounded-lg border border-gray-200 bg-white shadow-lg",
        sideClass,
        alignClass,
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
