/**
 * KST 기준 "YYYY-MM-DD HH:mm 기준" 포맷팅.
 * 대시보드 신호 카드(날씨/환율 등)에서 데이터가 언제 받아졌는지 표시.
 */
export function formatFetchedAt(date: Date): string {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} 기준`;
}
