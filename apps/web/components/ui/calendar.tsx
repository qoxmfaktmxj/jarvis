"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label:
          "text-[13px] font-semibold text-(--fg-primary)",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-(--bg-surface) rounded-md",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-[11px] font-semibold uppercase tracking-[0.1em] text-(--fg-muted) rounded-md w-9",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "[&:has([aria-selected].day-outside)]:bg-(--brand-primary-bg)",
          "[&:has([aria-selected])]:bg-(--brand-primary-bg)",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-(--fg-primary) hover:bg-(--bg-surface) rounded-md",
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-(--brand-primary) text-white hover:bg-(--brand-primary-hover)",
        day_today:
          "bg-(--brand-primary-bg) text-(--brand-primary-text)",
        day_outside:
          "day-outside opacity-50 text-(--fg-muted) aria-selected:bg-(--brand-primary-bg) aria-selected:text-(--brand-primary-text) aria-selected:opacity-30",
        day_disabled: "opacity-40 text-(--fg-muted)",
        day_range_middle:
          "aria-selected:bg-(--brand-primary-bg) aria-selected:text-(--brand-primary-text)",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" {...rest} />;
          if (orientation === "right") return <ChevronRight className="h-4 w-4" {...rest} />;
          return <ChevronRight className={`h-4 w-4 ${orientation === "up" ? "-rotate-90" : "rotate-90"}`} {...rest} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
