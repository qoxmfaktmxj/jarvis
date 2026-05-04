// apps/web/components/ui/DatePicker/CalendarPopup.tsx
"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceHolidays } from "./useWorkspaceHolidays";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Props = {
  value: string | null;       // ISO yyyy-mm-dd or null
  onSelect: (iso: string) => void;
  onClose: () => void;
  min?: string;
  max?: string;
};

function fmt(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isInRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export function CalendarPopup({ value, onSelect, onClose, min, max }: Props) {
  const t = useTranslations("Common.Calendar");
  const tWeekday = useTranslations("Common.Calendar.weekdays");
  const today = useMemo(() => {
    const d = new Date();
    return fmt(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const initial = value ?? today;
  const [year, setYear] = useState(Number(initial.slice(0, 4)));
  const [monthIndex, setMonthIndex] = useState(Number(initial.slice(5, 7)) - 1);
  const [focusISO, setFocusISO] = useState(initial);
  const gridRef = useRef<HTMLDivElement>(null);
  const { holidaysByDate } = useWorkspaceHolidays(year, monthIndex);

  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  const firstDayOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startWeekday = firstDayOfMonth.getUTCDay(); // 0=Sun

  // 6 weeks * 7 days = 42 cells. Pad with prev/next month days for grid alignment.
  const cells: { iso: string; day: number; inMonth: boolean; weekday: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - startWeekday;
    const date = new Date(Date.UTC(year, monthIndex, 1 + offset));
    cells.push({
      iso: fmt(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthIndex,
      weekday: date.getUTCDay(),
    });
  }

  const moveFocus = (deltaDays: number) => {
    const parts = focusISO.split("-").map(Number);
    const y = parts[0]!;
    const m = parts[1]!;
    const d = parts[2]!;
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
    const nextISO = fmt(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
    setFocusISO(nextISO);
    if (next.getUTCFullYear() !== year || next.getUTCMonth() !== monthIndex) {
      setYear(next.getUTCFullYear());
      setMonthIndex(next.getUTCMonth());
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); moveFocus(-1); break;
      case "ArrowRight": e.preventDefault(); moveFocus(1); break;
      case "ArrowUp":    e.preventDefault(); moveFocus(-7); break;
      case "ArrowDown":  e.preventDefault(); moveFocus(7); break;
      case "PageUp": {
        e.preventDefault();
        const newMonth = monthIndex === 0 ? 11 : monthIndex - 1;
        const newYear = monthIndex === 0 ? year - 1 : year;
        setMonthIndex(newMonth);
        setYear(newYear);
        break;
      }
      case "PageDown": {
        e.preventDefault();
        const newMonth = monthIndex === 11 ? 0 : monthIndex + 1;
        const newYear = monthIndex === 11 ? year + 1 : year;
        setMonthIndex(newMonth);
        setYear(newYear);
        break;
      }
      case "Home":       e.preventDefault(); moveFocus(-(new Date(focusISO).getUTCDay())); break;
      case "End":        e.preventDefault(); moveFocus(6 - new Date(focusISO).getUTCDay()); break;
      case "Enter": case " ":
        e.preventDefault();
        if (isInRange(focusISO, min, max)) onSelect(focusISO);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  const goPrevMonth = () => { if (monthIndex === 0) { setYear((y) => y - 1); setMonthIndex(11); } else setMonthIndex((m) => m - 1); };
  const goNextMonth = () => { if (monthIndex === 11) { setYear((y) => y + 1); setMonthIndex(0); } else setMonthIndex((m) => m + 1); };

  return (
    <div className="z-50 w-[280px] rounded-lg border border-warm-200 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={goPrevMonth} aria-label={t("prev")} className="rounded p-1 hover:bg-warm-100">
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-semibold text-warm-900">
          {t("monthLabel", { year, month: monthIndex + 1 })}
        </div>
        <button type="button" onClick={goNextMonth} aria-label={t("next")} className="rounded p-1 hover:bg-warm-100">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-warm-500">
        {WEEKDAY_KEYS.map((k, i) => (
          <div key={k} className={cn("py-1", i === 0 && "text-red-500", i === 6 && "text-notion-blue-text")}>{tWeekday(k)}</div>
        ))}
      </div>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        onKeyDown={handleKey}
        className="grid grid-cols-7 gap-0.5 outline-none"
      >
        {Array.from({ length: 6 }, (_, weekIdx) => (
          <div key={weekIdx} role="row" className="contents">
            {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((c) => {
              const holiday = holidaysByDate.get(c.iso);
              const isHoliday = !!holiday;
              const isSunday = c.weekday === 0;
              const isSaturday = c.weekday === 6;
              const isToday = c.iso === today;
              const isSelected = c.iso === value;
              const isFocused = c.iso === focusISO;
              const inRange = isInRange(c.iso, min, max);

              return (
                <button
                  key={c.iso}
                  role="gridcell"
                  type="button"
                  aria-label={`${c.iso}${holiday ? ` (${holiday.name})` : ""}`}
                  aria-selected={isSelected}
                  title={holiday?.name}
                  disabled={!inRange}
                  onClick={() => onSelect(c.iso)}
                  className={cn(
                    "relative h-8 w-8 rounded text-[12px] transition-colors duration-150",
                    !c.inMonth && "text-warm-300",
                    c.inMonth && (isSunday || isHoliday) && "text-red-500",
                    c.inMonth && isSaturday && !isHoliday && "text-notion-blue",
                    c.inMonth && !isSunday && !isSaturday && !isHoliday && "text-warm-900",
                    isFocused && !isSelected && "ring-2 ring-notion-blue/40 ring-inset",
                    isSelected && "bg-notion-blue text-white",
                    isToday && !isSelected && "border border-notion-blue/60",
                    inRange && !isSelected && "hover:bg-warm-100",
                    !inRange && "cursor-not-allowed opacity-40",
                  )}
                >
                  {c.day}
                  {holiday && (
                    <span
                      data-holiday-dot
                      className="absolute right-1 top-1 h-1 w-1 rounded-full bg-red-500"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
