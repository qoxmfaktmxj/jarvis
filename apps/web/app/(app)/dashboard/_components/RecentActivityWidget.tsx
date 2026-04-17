"use client";

import { useTranslations } from "next-intl";
import type { AuditLogEntry } from "@/lib/queries/dashboard";

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

/**
 * RecentActivityWidget — timeline flow (no card).
 * Left: time column. Right: action + resource. Separator = hairline + dot marker.
 */
export function RecentActivityWidget({
  entries
}: {
  entries: AuditLogEntry[];
}) {
  const t = useTranslations("Dashboard.RecentActivity");

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-surface-200" aria-hidden />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ol className="relative flex-1 space-y-4">
          {/* Continuous rail */}
          <span
            className="absolute bottom-1 left-[4.25rem] top-1 w-px bg-surface-200"
            aria-hidden
          />
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="relative grid grid-cols-[4.25rem_1fr] gap-4"
            >
              <time className="text-display pt-0.5 text-right text-xs tabular-nums text-surface-400">
                {formatTime(entry.createdAt)}
              </time>
              <div className="relative">
                <span
                  className="absolute -left-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full bg-isu-500 ring-4 ring-white"
                  aria-hidden
                />
                <p className="text-display text-sm font-semibold uppercase tracking-wide text-surface-700">
                  {entry.action}
                </p>
                <p className="text-sm text-surface-500">
                  {entry.resourceType}
                  {entry.resourceId ? (
                    <span className="text-surface-400"> · {entry.resourceId}</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
