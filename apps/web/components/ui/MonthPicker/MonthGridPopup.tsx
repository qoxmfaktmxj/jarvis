"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

type Props = {
  value: string | null; // ISO yyyy-mm or null
  onSelect: (iso: string) => void;
  onClose: () => void;
  min?: string; // yyyy-mm
  max?: string; // yyyy-mm
};

function fmt(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function isInRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export function MonthGridPopup({ value, onSelect, onClose, min, max }: Props) {
  const t = useTranslations("Common.Calendar");
  const tMonth = useTranslations("Common.Calendar.months");
  const today = useMemo(() => {
    const d = new Date();
    return fmt(d.getFullYear(), d.getMonth());
  }, []);
  const initial = value ?? today;
  const [year, setYear] = useState(Number(initial.slice(0, 4)));
  const [focusMonth, setFocusMonth] = useState(Number(initial.slice(5, 7)) - 1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  const moveFocus = (deltaMonths: number) => {
    let nextYear = year;
    let nextMonth = focusMonth + deltaMonths;
    while (nextMonth < 0) {
      nextYear -= 1;
      nextMonth += 12;
    }
    while (nextMonth > 11) {
      nextYear += 1;
      nextMonth -= 12;
    }
    setYear(nextYear);
    setFocusMonth(nextMonth);
  };

  const handleKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-3);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(3);
        break;
      case "PageUp":
        e.preventDefault();
        setYear((y) => y - 1);
        break;
      case "PageDown":
        e.preventDefault();
        setYear((y) => y + 1);
        break;
      case "Home":
        e.preventDefault();
        setFocusMonth(0);
        break;
      case "End":
        e.preventDefault();
        setFocusMonth(11);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const iso = fmt(year, focusMonth);
        if (isInRange(iso, min, max)) onSelect(iso);
        break;
      }
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  const goPrevYear = () => setYear((y) => y - 1);
  const goNextYear = () => setYear((y) => y + 1);

  return (
    <div className="z-50 w-[240px] rounded-lg border border-warm-200 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevYear}
          aria-label={t("prevYear")}
          className="rounded p-1 hover:bg-warm-100"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-semibold text-warm-900">
          {t("yearLabel", { year })}
        </div>
        <button
          type="button"
          onClick={goNextYear}
          aria-label={t("nextYear")}
          className="rounded p-1 hover:bg-warm-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        onKeyDown={handleKey}
        className="grid grid-cols-3 gap-1 outline-none"
      >
        {MONTH_KEYS.map((key, mIndex) => {
          const iso = fmt(year, mIndex);
          const inRange = isInRange(iso, min, max);
          const isSelected = iso === value;
          const isFocused = mIndex === focusMonth;
          const isCurrent = iso === today;
          return (
            <button
              key={key}
              role="gridcell"
              type="button"
              aria-label={iso}
              aria-selected={isSelected}
              disabled={!inRange}
              onClick={() => onSelect(iso)}
              className={cn(
                "h-9 rounded text-[12px] transition-colors duration-150",
                "text-warm-900",
                isFocused && !isSelected && "ring-2 ring-notion-blue/40 ring-inset",
                isSelected && "bg-notion-blue text-white",
                isCurrent && !isSelected && "border border-notion-blue/60",
                inRange && !isSelected && "hover:bg-warm-100",
                !inRange && "cursor-not-allowed opacity-40",
              )}
            >
              {tMonth(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
