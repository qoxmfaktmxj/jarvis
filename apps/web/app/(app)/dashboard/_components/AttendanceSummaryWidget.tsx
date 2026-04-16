"use client";

import { useTranslations } from "next-intl";
import type { AttendanceSummary } from "@/lib/queries/dashboard";

/**
 * AttendanceSummaryWidget — HERO variant.
 * Bare flow layout (no card). Massive display percentage anchors the row.
 * Breakdown list sits beside the number via a 2-column intra-hero grid.
 */
export function AttendanceSummaryWidget({
  summary
}: {
  summary: AttendanceSummary;
}) {
  const t = useTranslations("Dashboard.Attendance");
  const attendanceRate =
    summary.totalDays > 0
      ? Math.round(
          ((summary.presentDays + summary.lateDays) / summary.totalDays) * 100
        )
      : 0;

  const healthy = attendanceRate >= 90;

  return (
    <section
      aria-label={t("title")}
      className="flex h-full flex-col justify-between gap-6 rounded-xl bg-surface-50 p-6 md:p-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {t("title")}
        </h2>
        <span
          className={
            healthy
              ? "inline-flex items-center gap-1.5 text-xs font-medium text-lime-700"
              : "inline-flex items-center gap-1.5 text-xs font-medium text-warning"
          }
        >
          <span
            className={
              healthy
                ? "h-1.5 w-1.5 rounded-full bg-lime-500"
                : "h-1.5 w-1.5 rounded-full bg-warning"
            }
            aria-hidden
          />
          {healthy ? "Healthy" : "Attention"}
        </span>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <p
          className={
            healthy
              ? "text-display text-7xl font-bold leading-none tracking-tight text-surface-900 sm:text-8xl"
              : "text-display text-7xl font-bold leading-none tracking-tight text-warning sm:text-8xl"
          }
        >
          {attendanceRate}
          <span className="text-4xl font-semibold text-surface-400 sm:text-5xl">
            %
          </span>
        </p>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 sm:text-right">
          <div className="sm:text-right">
            <dt className="text-xs text-surface-500">{t("present")}</dt>
            <dd className="text-display text-lg font-semibold text-surface-800">
              {summary.presentDays}
              <span className="ml-0.5 text-sm font-normal text-surface-400">
                d
              </span>
            </dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-xs text-surface-500">{t("late")}</dt>
            <dd className="text-display text-lg font-semibold text-warning">
              {summary.lateDays}
              <span className="ml-0.5 text-sm font-normal text-surface-400">
                d
              </span>
            </dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-xs text-surface-500">{t("absent")}</dt>
            <dd className="text-display text-lg font-semibold text-danger">
              {summary.absentDays}
              <span className="ml-0.5 text-sm font-normal text-surface-400">
                d
              </span>
            </dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-xs text-surface-500">{t("totalDays")}</dt>
            <dd className="text-display text-lg font-semibold text-surface-800">
              {summary.totalDays}
              <span className="ml-0.5 text-sm font-normal text-surface-400">
                d
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Hairline progress — minimal, 1px, top-aligned */}
      <div className="h-px w-full bg-surface-200" aria-hidden>
        <div
          className={
            healthy
              ? "h-px bg-lime-500 transition-all duration-500"
              : "h-px bg-warning transition-all duration-500"
          }
          style={{ width: `${attendanceRate}%` }}
          role="progressbar"
          aria-valuenow={attendanceRate}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </section>
  );
}
