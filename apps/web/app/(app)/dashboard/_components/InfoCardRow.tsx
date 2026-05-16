import type { DashboardSignals } from "@/lib/queries/dashboard-signals";
import type { NextHoliday } from "@/lib/queries/dashboard-dday";
import { TodayCard } from "./TodayCard";
import { DDayCard } from "./DDayCard";
import { FxCardServer } from "./FxCardServer";

/**
 * 대시보드 상단 3-up 카드 행.
 *
 *  ┌─Today────┐ ┌─D-day──┐ ┌─FX────┐
 *  │날짜+시간 │ │D-37    │ │USD/EUR│
 *  │+ 날씨    │ │공휴일  │ │JPY    │
 *  └──────────┘ └────────┘ └───────┘
 *
 * 정보 그라데이션: 시간(local) → 미래(D-day) → 외부(환율).
 * 우측 column의 VacationsWidget이 row 1을 채워 4-up 효과 유지.
 * QuoteCard(오늘의 한 줄)는 2026-05-16 viewport-fit 재구성에서 제거됨.
 */
export function InfoCardRow({
  now,
  signals,
  nextHoliday
}: {
  now: Date;
  signals: DashboardSignals;
  nextHoliday: NextHoliday | null;
}) {
  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-3">
      <TodayCard now={now} weather={signals.weather} />
      <DDayCard next={nextHoliday} />
      <FxCardServer fx={signals.fx} />
    </div>
  );
}
