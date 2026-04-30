import type { NextHoliday } from "@/lib/queries/dashboard-dday";

/**
 * DDayCard — 다음 공휴일 카운트다운.
 *
 * 위계:
 *  ┌─────────────────────────┐
 *  │ 다음 공휴일             │   ← 13px, secondary
 *  │   D-37                  │   ← 36px bold mono
 *  │ 어린이날 · 5월 5일(월)  │   ← 12px muted
 *  └─────────────────────────┘
 *
 * 데이터 없을 때(공휴일 미입력 워크스페이스) → 빈 상태 메시지.
 */
export function DDayCard({ next }: { next: NextHoliday | null }) {
  if (!next) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
        <span className="text-[13px] font-medium text-(--fg-secondary)">
          다음 공휴일
        </span>
        <span className="text-[36px] font-bold leading-none tracking-tight text-(--fg-muted) tabular-nums">
          —
        </span>
        <span className="text-[12px] text-(--fg-muted)">
          등록된 공휴일이 없습니다
        </span>
      </div>
    );
  }

  const ddayLabel = next.daysFromToday === 0 ? "D-Day" : `D-${next.daysFromToday}`;
  const dateMeta = formatDateLabelKst(next.date);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-[13px] font-medium text-(--fg-secondary)">
        다음 공휴일
      </span>
      <span
        className="font-mono text-[36px] font-bold leading-none tracking-tight tabular-nums text-(--fg-primary)"
        style={{ fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, monospace" }}
      >
        {ddayLabel}
      </span>
      <span className="text-[12px] text-(--fg-muted)">
        {next.name}
        <span className="mx-1.5">·</span>
        {dateMeta}
      </span>
    </div>
  );
}

/** "5월 5일(월)" 형태로 포매팅. */
function formatDateLabelKst(dateStr: string): string {
  const ts = Date.parse(`${dateStr}T00:00:00+09:00`);
  if (!Number.isFinite(ts)) return dateStr;
  const d = new Date(ts);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short"
  });
  // formatToParts → "5월 5일 (월)" 형태에서 weekday를 괄호로 묶어 합치기.
  const parts = fmt.formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${month} ${day}일(${weekday})`;
}
