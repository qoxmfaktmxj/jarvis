import type { DashboardSignals } from "@/lib/queries/dashboard-signals";
import type { NextHoliday } from "@/lib/queries/dashboard-dday";
import { TodayCard } from "./TodayCard";
import { DDayCard } from "./DDayCard";
import { FxCardServer } from "./FxCardServer";
import { QuoteCard } from "./QuoteCard";

/**
 * 대시보드 상단 4-up 카드 행.
 *
 *  ┌─Today────┐ ┌─D-day──┐ ┌─FX────┐ ┌─Quote─────┐
 *  │날짜+시간 │ │D-37    │ │USD/EUR│ │zen capy + │
 *  │+ 날씨    │ │공휴일  │ │JPY    │ │명언 한 줄 │
 *  └──────────┘ └────────┘ └───────┘ └───────────┘
 *
 * 정보 그라데이션: 시간(local) → 미래(D-day) → 외부(환율) → 내면(명언).
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <TodayCard now={now} weather={signals.weather} />
      <DDayCard next={nextHoliday} />
      <FxCardServer fx={signals.fx} />
      <QuoteCard now={now} />
    </div>
  );
}
