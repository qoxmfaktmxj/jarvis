/**
 * Calculate man-days between two YYYYMMDD date strings (inclusive),
 * applying weekend and holiday weights.
 *
 * Defaults match legacy contractServMgr.jsp policy:
 *   - weekday: 1.0
 *   - Saturday: 0.5
 *   - Sunday: 0
 *   - holiday (workspace-scoped): 0
 *
 * Returns null when input is malformed or end < start.
 */
export type MandayWeights = {
  weekday: number; // default 1
  saturday: number; // default 0.5
  sunday: number; // default 0
  holiday: number; // default 0
};

export const DEFAULT_MANDAY_WEIGHTS: MandayWeights = {
  weekday: 1,
  saturday: 0.5,
  sunday: 0,
  holiday: 0,
};

export function calcManday(
  symd: string | null | undefined,
  eymd: string | null | undefined,
  holidays: Set<string> = new Set(),
  weights: MandayWeights = DEFAULT_MANDAY_WEIGHTS,
): number | null {
  if (!symd || !eymd) return null;
  if (!/^\d{8}$/.test(symd) || !/^\d{8}$/.test(eymd)) return null;
  const start = parseYmd(symd);
  const end = parseYmd(eymd);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  let total = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const ymd = toYmd(cursor);
    if (holidays.has(ymd)) {
      total += weights.holiday;
    } else {
      const dow = cursor.getDay(); // 0=Sun, 6=Sat
      if (dow === 0) total += weights.sunday;
      else if (dow === 6) total += weights.saturday;
      else total += weights.weekday;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  // Round to 1 decimal place to keep display clean (legacy pattern)
  return Math.round(total * 10) / 10;
}

function parseYmd(s: string): Date | null {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return dt;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
