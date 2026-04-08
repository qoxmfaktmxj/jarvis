"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";

interface SelectContextValue {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled?: boolean;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelect() {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used within <Select>");
  return ctx;
}

export function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, disabled }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { open, setOpen, disabled } = useSelect();
  return (
    <button
      type="button"
      onClick={() => !disabled && setOpen(!open)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100",
        className
      )}
      disabled={disabled}
    >
      {children}
      <svg className="h-4 w-4 text-gray-400 flex-none ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useSelect();
  return <span className={cn(!value && "text-gray-400")}>{value || placeholder}</span>;
}

export function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  const { open, setOpen } = useSelect();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: selected, onValueChange, setOpen } = useSelect();
  return (
    <div
      role="option"
      aria-selected={selected === value}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      className={cn(
        "flex cursor-pointer items-center px-3 py-2 text-sm text-gray-900 hover:bg-gray-50",
        selected === value && "bg-blue-50 text-blue-700 font-medium",
        className
      )}
    >
      {children}
    </div>
  );
}
