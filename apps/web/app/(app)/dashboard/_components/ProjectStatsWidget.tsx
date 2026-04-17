"use client";

import { FolderKanban } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProjectStats } from "@/lib/queries/dashboard";

/**
 * ProjectStatsWidget — compact card.
 * Sits beside the attendance HERO. Headline total + thin status bars.
 */
export function ProjectStatsWidget({ stats }: { stats: ProjectStats }) {
  const t = useTranslations("Dashboard.ProjectStats");
  const entries = Object.entries(stats.byStatus);

  return (
    <section
      aria-label={t("title")}
      className="flex h-full flex-col gap-5 rounded-xl border border-surface-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {t("title")}
        </h2>
        <FolderKanban className="h-4 w-4 text-surface-400" aria-hidden />
      </div>

      <div>
        <p className="text-display text-5xl font-bold leading-none tracking-tight text-isu-600">
          {stats.total}
        </p>
        <p className="mt-2 text-xs text-surface-500">{t("description")}</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="mt-auto space-y-2">
          {entries.map(([status, count]) => {
            const width =
              stats.total > 0 ? Math.max((count / stats.total) * 100, 4) : 0;
            return (
              <li key={status} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-surface-600">
                    {status.replaceAll("_", " ")}
                  </span>
                  <span className="text-display font-semibold text-surface-800">
                    {count}
                  </span>
                </div>
                <div className="h-0.5 overflow-hidden rounded-full bg-surface-100">
                  <div
                    className="h-full rounded-full bg-isu-500 transition-all duration-300"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
