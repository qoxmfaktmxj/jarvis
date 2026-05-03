"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWorkspaceHolidays } from "@/components/ui/DatePicker/useWorkspaceHolidays";
import { listCalendarEventsAction } from "../actions";
import type { ScheduleEventRow } from "@jarvis/shared/validation/schedule";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MAX_VISIBLE_PER_DAY = 3;

function fmt(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type GridCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  weekday: number;
};

function buildGridCells(year: number, monthIndex: number): GridCell[] {
  const firstDayOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startWeekday = firstDayOfMonth.getUTCDay();
  const cells: GridCell[] = [];
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
  return cells;
}

/**
 * 이벤트가 [startDate, endDate] 범위에 걸쳐 있을 때, 해당 범위에 들어가는
 * 모든 셀에 동일 이벤트를 매핑한다. (spanning visualization 단순화 — 각 날에
 * 짧은 chip으로 표시)
 */
function eventsByDate(events: ScheduleEventRow[]): Map<string, ScheduleEventRow[]> {
  const map = new Map<string, ScheduleEventRow[]>();
  for (const ev of events) {
    const start = new Date(ev.startDate + "T00:00:00Z");
    const end = new Date(ev.endDate + "T00:00:00Z");
    for (
      let d = new Date(start);
      d.getTime() <= end.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const iso = fmt(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const arr = map.get(iso) ?? [];
      arr.push(ev);
      map.set(iso, arr);
    }
  }
  return map;
}

export function ScheduleCalendarView() {
  const t = useTranslations("Schedule.Page");
  const tCal = useTranslations("Schedule.Page.calendar");
  const today = useMemo(() => {
    const d = new Date();
    return fmt(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [monthIndex, setMonthIndex] = useState(() => Number(today.slice(5, 7)) - 1);
  const [events, setEvents] = useState<ScheduleEventRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();

  const { holidaysByDate } = useWorkspaceHolidays(year, monthIndex);
  const cells = useMemo(() => buildGridCells(year, monthIndex), [year, monthIndex]);

  // grid의 첫 셀과 마지막 셀로 query range 결정 (이전/다음 달 spillover 포함)
  const fromDate = cells[0]!.iso;
  const toDate = cells[41]!.iso;

  useEffect(() => {
    startTransition(async () => {
      const res = await listCalendarEventsAction({ fromDate, toDate });
      if (res.ok) setEvents(res.rows);
      else setEvents([]);
    });
  }, [fromDate, toDate]);

  const eventMap = useMemo(() => eventsByDate(events), [events]);

  const goPrevMonth = () => {
    if (monthIndex === 0) {
      setYear((y) => y - 1);
      setMonthIndex(11);
    } else {
      setMonthIndex((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const goNextMonth = () => {
    if (monthIndex === 11) {
      setYear((y) => y + 1);
      setMonthIndex(0);
    } else {
      setMonthIndex((m) => m + 1);
    }
    setSelectedDate(null);
  };

  const goToday = () => {
    setYear(Number(today.slice(0, 4)));
    setMonthIndex(Number(today.slice(5, 7)) - 1);
    setSelectedDate(today);
  };

  const selectedEvents = selectedDate ? eventMap.get(selectedDate) ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <section className="rounded-lg border border-(--border-default) bg-(--bg-page) p-3">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label={tCal("prev")}
              className="rounded p-1 text-(--fg-secondary) hover:bg-(--bg-surface) hover:text-(--fg-primary)"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-[14px] font-semibold text-(--fg-primary)">
              {year}년 {monthIndex + 1}월
            </div>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label={tCal("next")}
              className="rounded p-1 text-(--fg-secondary) hover:bg-(--bg-surface) hover:text-(--fg-primary)"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-(--fg-secondary)">
            <Button size="sm" variant="outline" onClick={goToday}>
              {tCal("today")}
            </Button>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" /> {tCal("legend.own")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" /> {tCal("legend.shared")}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-7 gap-px text-[11px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "px-2 py-2 text-center",
                i === 0 && "text-rose-500",
                i === 6 && "text-blue-600",
              )}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-(--border-default)">
          {cells.map((c) => {
            const holiday = holidaysByDate.get(c.iso);
            const isHoliday = !!holiday;
            const isSunday = c.weekday === 0;
            const isSaturday = c.weekday === 6;
            const isToday = c.iso === today;
            const isSelected = c.iso === selectedDate;
            const evs = eventMap.get(c.iso) ?? [];
            const visible = evs.slice(0, MAX_VISIBLE_PER_DAY);
            const moreCount = evs.length - visible.length;

            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => setSelectedDate(c.iso)}
                aria-label={`${c.iso}${holiday ? ` (${holiday.name})` : ""}`}
                aria-pressed={isSelected}
                className={cn(
                  "relative flex min-h-[88px] flex-col items-stretch gap-1 bg-(--bg-page) p-1 text-left text-[12px] transition-colors hover:bg-slate-50",
                  !c.inMonth && "bg-slate-50/40 text-(--fg-muted)",
                  isSelected && "ring-2 ring-blue-500 ring-inset",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-between text-[11px] font-semibold",
                    c.inMonth && (isSunday || isHoliday) && "text-rose-600",
                    c.inMonth && isSaturday && !isHoliday && "text-blue-600",
                    c.inMonth && !isSunday && !isSaturday && !isHoliday && "text-(--fg-primary)",
                    isToday && "rounded-full bg-blue-500 px-1.5 py-0 text-white",
                  )}
                >
                  <span>{c.day}</span>
                  {holiday ? (
                    <span
                      title={holiday.name}
                      className="ml-1 truncate text-[10px] font-normal text-rose-600"
                    >
                      {holiday.name}
                    </span>
                  ) : null}
                </span>
                <ul className="flex flex-col gap-0.5">
                  {visible.map((ev) => (
                    <li
                      key={ev.id}
                      className={cn(
                        "truncate rounded px-1 text-[10.5px] leading-4",
                        ev.isOwn
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-200 text-slate-700",
                      )}
                      title={`${ev.title}${ev.userName ? ` · ${ev.userName}` : ""}`}
                    >
                      {ev.title}
                    </li>
                  ))}
                  {moreCount > 0 ? (
                    <li className="text-[10px] text-(--fg-secondary)">
                      +{moreCount} {tCal("more")}
                    </li>
                  ) : null}
                </ul>
              </button>
            );
          })}
        </div>
        {isLoading ? (
          <p className="mt-2 text-[11px] text-(--fg-secondary)">{tCal("loading")}</p>
        ) : null}
      </section>

      <aside className="rounded-lg border border-(--border-default) bg-(--bg-page) p-3">
        <header className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
          {selectedDate ? selectedDate : tCal("selectDate")}
        </header>
        {selectedDate ? (
          selectedEvents.length === 0 ? (
            <p className="text-[12px] text-(--fg-secondary)">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedEvents.map((ev) => (
                <li
                  key={ev.id}
                  className={cn(
                    "rounded border-l-4 bg-(--bg-surface) p-2 text-[12px]",
                    ev.isOwn ? "border-blue-500" : "border-slate-400",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-(--fg-primary)">{ev.title}</div>
                    {ev.isShared ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-700">
                        {t("shared.yes")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-(--fg-secondary)">
                    {ev.startDate} ~ {ev.endDate}
                    {ev.userName ? ` · ${ev.userName}` : ""}
                  </div>
                  {ev.memo ? (
                    <p className="mt-1 whitespace-pre-line text-[11px] text-(--fg-secondary)">
                      {ev.memo}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-[12px] text-(--fg-secondary)">{tCal("selectHint")}</p>
        )}
      </aside>
    </div>
  );
}
