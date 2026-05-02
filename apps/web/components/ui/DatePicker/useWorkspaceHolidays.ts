"use client";
import { useEffect, useState } from "react";

type HolidayInfo = { name: string; note: string | null };

const cache = new Map<string, Map<string, HolidayInfo>>(); // key = YYYY-MM, value = date->info

export function __resetHolidayCache() {
  cache.clear();
}

function ymKey(year: number, monthIndex: number) {
  const m = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${m}`;
}

function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(firstDay), to: fmt(lastDay) };
}

/**
 * Lazy-fetch workspace holidays for the visible calendar month.
 * Result is keyed by ISO date string ("YYYY-MM-DD") for O(1) cell lookup.
 * In-memory cache is component-tree scope (module-level Map).
 */
export function useWorkspaceHolidays(year: number, monthIndex: number) {
  const key = ymKey(year, monthIndex);
  const [holidaysByDate, setHolidaysByDate] = useState<Map<string, HolidayInfo>>(
    () => cache.get(key) ?? new Map(),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setHolidaysByDate(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const { from, to } = monthRange(year, monthIndex);
    fetch(`/api/holidays/range?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : { holidays: [] }))
      .then((j: { holidays: { date: string; name: string; note: string | null }[] }) => {
        const map = new Map<string, HolidayInfo>();
        for (const h of j.holidays ?? []) map.set(h.date, { name: h.name, note: h.note });
        cache.set(key, map);
        if (!cancelled) {
          setHolidaysByDate(map);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, year, monthIndex]);

  return { holidaysByDate, loading };
}
