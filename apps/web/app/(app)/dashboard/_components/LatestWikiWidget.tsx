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
    <section className="rounded-xl border border-surface-200 bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-800">{t("title")}</h2>
        <Link href="/wiki" className="text-xs text-surface-500 hover:text-isu-600">
          {t("viewAll")} →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((w) => (
            <li key={w.id} className="flex flex-col">
              <Link
                href={`/wiki/${workspaceId}/${w.path}`}
                className="truncate text-sm font-medium text-surface-800 hover:text-isu-600"
              >
                {w.title}
              </Link>
              <div className="flex items-center gap-1 text-xs text-surface-500">
                {w.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-surface-600"
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
