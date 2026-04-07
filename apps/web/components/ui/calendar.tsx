"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CalendarClassNames {
  months?: string;
  month?: string;
  table?: string;
  head_row?: string;
  head_cell?: string;
  row?: string;
  cell?: string;
  day?: string;
  day_outside?: string;
  day_disabled?: string;
}

interface DayComponentProps {
  date: Date;
  displayMonth: Date;
}

interface CalendarProps {
  mode?: "single" | "multiple" | "range";
  month?: Date;
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  onMonthChange?: (month: Date) => void;
  disabled?: (date: Date) => boolean;
  classNames?: CalendarClassNames;
  className?: string;
  components?: {
    Day?: React.ComponentType<DayComponentProps>;
  };
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad leading days from previous month
  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, -firstDay.getDay() + i + 1);
    days.push(d);
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad trailing days from next month
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

export function Calendar({
  month,
  selected,
  onSelect,
  onMonthChange: _onMonthChange,
  disabled,
  classNames = {},
  className,
  components = {},
}: CalendarProps) {
  const [displayMonth, setDisplayMonth] = React.useState<Date>(
    month ?? new Date()
  );

  React.useEffect(() => {
    if (month) setDisplayMonth(month);
  }, [month]);

  const DayComponent = components.Day;

  const year = displayMonth.getFullYear();
  const monthIndex = displayMonth.getMonth();
  const days = getDaysInMonth(year, monthIndex);

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className={cn("p-3", className)}>
      <div className={cn("flex flex-col gap-4", classNames.months)}>
        <div className={cn("space-y-4", classNames.month)}>
          {/* Month header */}
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-medium">
              {displayMonth.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => {
                  const prev = new Date(year, monthIndex - 1, 1);
                  setDisplayMonth(prev);
                  _onMonthChange?.(prev);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => {
                  const next = new Date(year, monthIndex + 1, 1);
                  setDisplayMonth(next);
                  _onMonthChange?.(next);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Calendar table */}
          <table className={cn("w-full border-collapse", classNames.table)}>
            <thead>
              <tr className={cn("flex", classNames.head_row)}>
                {WEEKDAY_LABELS.map((label) => (
                  <th
                    key={label}
                    className={cn(
                      "text-muted-foreground rounded-md w-full font-normal text-xs text-center",
                      classNames.head_cell
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi} className={cn("flex w-full mt-2", classNames.row)}>
                  {week.map((date, di) => {
                    const isOutside = date.getMonth() !== monthIndex;
                    const isDisabled = disabled?.(date) ?? false;
                    const isSelected =
                      selected &&
                      date.toDateString() === selected.toDateString();

                    return (
                      <td
                        key={di}
                        className={cn(
                          "relative h-16 w-full p-0 text-center text-sm focus-within:relative focus-within:z-20",
                          isSelected && "[&:has([aria-selected])]:bg-accent",
                          classNames.cell
                        )}
                      >
                        {DayComponent ? (
                          <DayComponent
                            date={date}
                            displayMonth={displayMonth}
                          />
                        ) : (
                          <button
                            type="button"
                            aria-selected={isSelected}
                            disabled={isDisabled}
                            onClick={() => !isDisabled && onSelect?.(date)}
                            className={cn(
                              "h-full w-full p-0 font-normal",
                              classNames.day,
                              isOutside && classNames.day_outside,
                              isDisabled && classNames.day_disabled
                            )}
                          >
                            {date.getDate()}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
