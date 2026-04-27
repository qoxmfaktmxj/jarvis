import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardVacationRow } from "@/lib/queries/dashboard-vacations";

const TYPE_KEY: Record<string, string> = {
  annual: "annual",
  halfAm: "halfAm",
  halfPm: "halfPm",
  sick: "sick",
  family: "family"
};

function typeLabel(
  t: (key: string) => string,
  type: string
): string {
  const k = TYPE_KEY[type] ?? "annual";
  return t(`types.${k}`);
}

function fmtRange(start: string, end: string): string {
  const s = start.slice(5).replace("-", "/");
  const e = end.slice(5).replace("-", "/");
  return s === e ? s : `${s}-${e}`;
}

function nextBusinessDay(end: string): {
  date: string;
  weekday: string;
} {
  const next = new Date(`${end}T00:00:00+09:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  while ([0, 6].includes(next.getUTCDay())) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short"
  }).format(next);
  return {
    date: `${next.getUTCMonth() + 1}/${next.getUTCDate()}`,
    weekday
  };
}

export async function VacationsWidget({
  items
}: {
  items: DashboardVacationRow[];
}) {
  const t = await getTranslations("Dashboard.vacations");
  return (
    <section className="flex max-h-[220px] flex-col rounded-xl border border-[--border-default] bg-[--bg-surface] p-4">
      <header className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold text-[--fg-primary]">{t("title")}</h2>
        <Link href="/contractors" className="text-xs text-[--fg-secondary] hover:text-[--brand-primary]">
          {t("count", { count: items.length })}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {items.map((v) => {
            const ret = nextBusinessDay(v.endDate);
            return (
              <li key={v.id} className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--bg-surface] text-xs font-semibold text-[--fg-primary]">
                  {v.userName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[--fg-primary]">
                    {v.userName}
                    {v.orgName ? (
                      <span className="ml-1 text-xs text-[--fg-secondary]">· {v.orgName}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[--fg-secondary]">
                    {typeLabel(t, v.type)} · {fmtRange(v.startDate, v.endDate)}
                  </div>
                </div>
                <div className="shrink-0 text-xs tabular-nums text-[--fg-secondary]">
                  {t("returnAt", { date: ret.date, weekday: ret.weekday })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
