import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardNoticeRow } from "@/lib/queries/dashboard-notices";

function badgeClassFor(n: DashboardNoticeRow): string {
  if (n.pinned) return "bg-danger-subtle text-danger border-danger/30";
  if (n.sensitivity === "PUBLIC") return "bg-warning-subtle text-warning border-warning/30";
  return "bg-[--bg-surface] text-[--fg-secondary] border-[--border-default]";
}

function rel(d: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export async function NoticesWidget({
  items,
  now
}: {
  items: DashboardNoticeRow[];
  now: Date;
}) {
  const t = await getTranslations("Dashboard.notices");
  return (
    <section className="flex max-h-[220px] flex-col rounded-xl border border-[--border-default] bg-[--bg-surface] p-4">
      <header className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold text-[--fg-primary]">{t("title")}</h2>
        <Link href="/notices" className="text-xs text-[--fg-secondary] hover:text-[--brand-primary]">
          {t("viewAll")} →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {items.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badgeClassFor(n)}`}
                >
                  {n.pinned ? t("badgePinned") : n.sensitivity === "PUBLIC" ? t("badgeEvent") : t("badgeNotice")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[--fg-primary]">{n.title}</div>
                  <div className="text-xs text-[--fg-secondary]">
                    {n.authorName} · {n.publishedAt ? rel(n.publishedAt, now) : "—"}
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
