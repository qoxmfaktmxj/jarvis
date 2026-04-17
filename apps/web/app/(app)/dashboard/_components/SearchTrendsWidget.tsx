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
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-surface-200" aria-hidden />
      </div>

      {trends.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ol className="flex-1 space-y-1.5">
          {trends.map((trend, index) => {
            const width = Math.round((trend.count / maxCount) * 100);
            return (
              <li key={trend.query} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                <span className="text-display text-xs font-semibold tabular-nums text-surface-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="relative h-7 overflow-hidden rounded-md bg-surface-100/60">
                  <div
                    className="absolute inset-y-0 left-0 bg-isu-100 transition-all duration-500"
                    style={{ width: `${width}%` }}
                    aria-hidden
                  />
                  <span className="relative flex h-full items-center truncate px-2.5 text-sm font-medium text-surface-800">
                    {trend.query}
                  </span>
                </div>
                <span className="text-display text-sm tabular-nums text-surface-600">
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
