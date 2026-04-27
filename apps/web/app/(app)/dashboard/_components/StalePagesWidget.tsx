"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StalePage } from "@/lib/queries/dashboard";

/**
 * StalePagesWidget — hairline section (no card).
 * Compact list with overdue-days emphasized in danger color, tabular numerals.
 */
export function StalePagesWidget({ pages }: { pages: StalePage[] }) {
  const t = useTranslations("Dashboard.StalePages");

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
          {t("title")}
        </h2>
        {pages.length > 0 ? (
          <span className="text-display text-xs font-semibold tabular-nums text-danger">
            {pages.length}
          </span>
        ) : null}
        <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("allFresh")}</p>
      ) : (
        <ul className="flex-1 divide-y divide-[--border-soft]">
          {pages.map((page) => (
            <li key={page.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/knowledge/${page.id}`}
                  className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-[--fg-primary] transition-colors duration-150 hover:text-[--brand-primary]"
                >
                  {page.title}
                </Link>
                <span className="text-display shrink-0 text-xs font-semibold tabular-nums text-danger">
                  +{page.overdueDays}d
                </span>
              </div>
              <p className="mt-1 text-xs tabular-nums text-[--fg-muted]">
                {t("overdueNote", {
                  date: page.lastReviewedAt.toISOString().slice(0, 10),
                  days: page.overdueDays
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
