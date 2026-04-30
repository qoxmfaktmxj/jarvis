/**
 * dashboard-dday.ts — 대시보드 D-day 카드용. 오늘 이후 가장 가까운 공휴일.
 */

import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { holiday } from "@jarvis/db/schema";

type DbLike = typeof db;

export interface NextHoliday {
  date: string; // YYYY-MM-DD (KST)
  name: string;
  daysFromToday: number; // 오늘 = 0, 내일 = 1
}

/**
 * 오늘(KST 기준) 이후 가장 가까운 공휴일 1건. 없으면 null.
 *
 * `now`는 시간 무관 — KST 날짜만 사용. holiday.date는 DATE 타입(시각 없음).
 */
export async function getNextHoliday(
  workspaceId: string,
  now: Date,
  database: DbLike = db
): Promise<NextHoliday | null> {
  const todayKst = formatKstDate(now);

  const [row] = await database
    .select({ date: holiday.date, name: holiday.name })
    .from(holiday)
    .where(
      and(eq(holiday.workspaceId, workspaceId), gte(holiday.date, todayKst))
    )
    .orderBy(asc(holiday.date))
    .limit(1);

  if (!row) return null;

  return {
    date: row.date,
    name: row.name,
    daysFromToday: daysBetweenKstDates(todayKst, row.date)
  };
}

/** KST 기준 YYYY-MM-DD. */
export function formatKstDate(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(now);
}

/** 두 YYYY-MM-DD 사이 일수(b - a). DST가 없는 KST이므로 단순 차분. */
export function daysBetweenKstDates(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00+09:00`);
  const tb = Date.parse(`${b}T00:00:00+09:00`);
  return Math.round((tb - ta) / 86_400_000);
}
