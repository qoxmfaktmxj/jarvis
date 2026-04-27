"use client";

import { useTranslations } from "next-intl";
import type { TrendItem } from "@/lib/queries/dashboard";

/**
 * SearchTrendsWidget — inline horizontal bars (no card).
 * Each row: rank · query (flex-1 bar underlay) · count. Bar is a filled
 * background behind the query text — not a separate visual element.
 */
export function SearchTrendsWidget({ trends }: { trends: TrendItem[] }) {
  const t = useTranslations("Dashboard.SearchTrends");
  const maxCount = trends[0]?.count ?? 1;

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
      </div>

      {trends.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("empty")}</p>
      ) : (
        <ol className="flex-1 space-y-1.5">
          {trends.map((trend, index) => {
            const width = Math.round((trend.count / maxCount) * 100);
            return (
              <li key={trend.query} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                <span className="text-display text-xs font-semibold tabular-nums text-[--fg-muted]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="relative h-7 overflow-hidden rounded-md bg-[--bg-surface]">
                  <div
                    className="absolute inset-y-0 left-0 bg-[--brand-primary-bg] transition-all duration-500"
                    style={{ width: `${width}%` }}
                    aria-hidden
                  />
                  <span className="relative flex h-full items-center truncate px-2.5 text-sm font-medium text-[--fg-primary]">
                    {trend.query}
                  </span>
                </div>
                <span className="text-display text-sm tabular-nums text-[--fg-secondary]">
                  {trend.count}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
