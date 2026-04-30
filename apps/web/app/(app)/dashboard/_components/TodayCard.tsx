import type { WeatherSignal } from "@/lib/queries/dashboard-signals";
import { TodayClock } from "./TodayClock";

/**
 * TodayCard — 오늘 날짜 + 라이브 시간 + 날씨 통합 카드.
 *
 * 위계:
 *  ┌───────────────────────────────────┐
 *  │ 2026. 04. 30 목 · 서울 18° ☀     │  ← 13px regular, secondary
 *  │   10:02:46                        │  ← 36px bold mono (TodayClock)
 *  │ H 22° L 12° · 미세먼지 좋음       │  ← 12px regular, muted
 *  └───────────────────────────────────┘
 *
 * 시간만 시각적으로 강조. 날짜·날씨는 컨텍스트 보조 정보.
 */
export function TodayCard({
  now,
  weather
}: {
  now: Date;
  weather: WeatherSignal | null;
}) {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dateLabel = `${year}. ${month}. ${day} ${weekday}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-[13px] font-medium text-(--fg-secondary) tabular-nums">
        {dateLabel}
        {weather ? (
          <>
            <span className="mx-1.5 text-(--fg-muted)">·</span>
            <span>
              {weather.region.label} {Math.round(weather.temp)}°
            </span>
            <SkyGlyph sky={weather.sky} pty={weather.pty} />
          </>
        ) : null}
      </span>

      <TodayClock />

      <span className="text-[12px] text-(--fg-muted) tabular-nums">
        {weather ? (
          <>
            H {Math.round(weather.hi)}° / L {Math.round(weather.lo)}°
            {weather.dust ? (
              <>
                <span className="mx-1.5">·</span>
                미세먼지 {weather.dust}
              </>
            ) : null}
            {weather.stale ? (
              <>
                <span className="mx-1.5">·</span>
                <span title="갱신 대기">갱신중</span>
              </>
            ) : null}
          </>
        ) : (
          "날씨 데이터를 불러오는 중…"
        )}
      </span>
    </div>
  );
}

function SkyGlyph({
  sky,
  pty
}: {
  sky: WeatherSignal["sky"];
  pty: WeatherSignal["pty"];
}) {
  // 강수가 우선. 없을 때만 sky.
  const glyph =
    pty === "비" || pty === "소나기"
      ? "🌧"
      : pty === "눈"
        ? "❄"
        : pty === "비/눈"
          ? "🌨"
          : sky === "맑음"
            ? "☀"
            : sky === "구름많음"
              ? "⛅"
              : "☁";
  return <span className="ml-1">{glyph}</span>;
}
