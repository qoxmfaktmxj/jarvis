import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardWikiRow } from "@/lib/queries/dashboard-wiki";

function rel(d: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export async function LatestWikiWidget({
  items,
  workspaceId,
  now
}: {
  items: DashboardWikiRow[];
  workspaceId: string;
  now: Date;
}) {
  const t = await getTranslations("Dashboard.latestWiki");
  return (
    <section className="flex max-h-[320px] flex-col rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <header className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold text-(--fg-primary)">{t("title")}</h2>
        <Link href="/wiki" className="text-xs text-(--fg-secondary) hover:text-(--brand-primary)">
          {t("viewAll")} →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-(--fg-secondary)">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {items.map((w) => (
            <li key={w.id} className="flex flex-col">
              <Link
                href={`/wiki/${workspaceId}/${w.path}`}
                className="truncate text-sm font-medium text-(--fg-primary) hover:text-(--brand-primary)"
              >
                {w.title}
              </Link>
              <div className="flex items-center gap-1 text-xs text-(--fg-secondary)">
                {w.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-(--bg-surface) px-1.5 py-0.5 text-[10px] font-semibold uppercase text-(--fg-secondary)"
                  >
                    {tag}
                  </span>
                ))}
                <span>
                  {w.authorName} · {rel(w.createdAt, now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
