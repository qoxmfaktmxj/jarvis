"use client";

import type { ComponentType } from "react";
import { Check, ChevronUp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AskModelOption {
  value: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}

interface AskModelPopoverProps {
  value: string;
  onChange: (next: string) => void;
  options: AskModelOption[];
  className?: string;
}

export function AskModelPopover({
  value,
  onChange,
  options,
  className,
}: AskModelPopoverProps) {
  if (options.length === 0) return null;
  const current = options.find((o) => o.value === value) ?? options[0]!;
  const TriggerIcon = current.icon;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-[--border-default] bg-card px-2 py-1 text-xs font-medium text-[--fg-primary] transition-colors duration-150 hover:border-[--border-default] hover:bg-[--bg-surface] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--border-focus]",
          className,
        )}
        aria-label={`모델: ${current.label}`}
      >
        {TriggerIcon ? (
          <TriggerIcon className="h-3 w-3 text-[--brand-primary]" />
        ) : null}
        <span>{current.label}</span>
        <ChevronUp className="h-3 w-3 text-[--fg-muted]" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-60 p-1"
      >
        <ul role="menu" className="flex flex-col">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150",
                    selected
                      ? "bg-[--brand-primary-bg] text-[--brand-primary-text]"
                      : "text-[--fg-primary] hover:bg-[--bg-surface]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {Icon ? (
                      <Icon
                        className={cn(
                          "h-3 w-3 shrink-0",
                          selected ? "text-[--brand-primary-text]" : "text-[--fg-secondary]",
                        )}
                      />
                    ) : null}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="truncate text-[11px] text-[--fg-muted]">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {selected ? (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-[--brand-primary-text]"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
