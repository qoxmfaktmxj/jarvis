"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// Root accordion context
interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionRoot() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("Accordion components must be within <Accordion>");
  return ctx;
}

// Item-level context to pass value down
const ItemValueContext = createContext<string | null>(null);

function useItemValue() {
  return useContext(ItemValueContext);
}

export function Accordion({
  type = "single",
  children,
  className,
}: {
  type?: "single" | "multiple";
  children: ReactNode;
  className?: string;
}) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggle = (value: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        if (type === "single") next.clear();
        next.add(value);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={cn("", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ItemValueContext.Provider value={value}>
      <div className={cn("border-b border-gray-200", className)}>
        {children}
      </div>
    </ItemValueContext.Provider>
  );
}

export function AccordionTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { openItems, toggle } = useAccordionRoot();
  const itemValue = useItemValue();

  const isOpen = itemValue ? openItems.has(itemValue) : false;

  return (
    <button
      type="button"
      onClick={() => itemValue && toggle(itemValue)}
      className={cn(
        "flex w-full items-center justify-between py-4 text-sm font-medium transition-all",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

export function AccordionContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { openItems } = useAccordionRoot();
  const itemValue = useItemValue();

  if (!itemValue || !openItems.has(itemValue)) return null;

  return (
    <div className={cn("pb-4 pt-0 text-sm", className)}>
      {children}
    </div>
  );
}
