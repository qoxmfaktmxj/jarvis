import { getTranslations } from "next-intl/server";

export async function DateCard({ now }: { now: Date }) {
  const t = await getTranslations("Dashboard.info");
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
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-xs font-medium text-(--fg-secondary)">
        {t("todayLabel")}
      </span>
      <span className="text-lg font-semibold tabular-nums text-(--fg-primary)">
        {year}. {month}. {day} {weekday}
      </span>
    </div>
  );
}
