"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TaskSummary } from "@/lib/queries/dashboard";

function statusStyles(status: string) {
  if (status === "in_progress") {
    return "bg-warning-subtle text-warning";
  }
  if (status === "blocked") {
    return "bg-danger-subtle text-danger";
  }
  return "bg-[--bg-surface] text-[--fg-secondary]";
}

/**
 * MyTasksWidget — hairline section (no card).
 * Rows separated by 1px dividers. Status shown as inline colored pill.
 */
export function MyTasksWidget({ tasks }: { tasks: TaskSummary[] }) {
  const t = useTranslations("Dashboard.MyTasks");

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("empty")}</p>
      ) : (
        <ul className="flex-1 divide-y divide-[--border-soft]">
          {tasks.map((task) => (
            <li key={task.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Link
                    href={`/projects/${task.projectId}`}
                    className="block truncate text-sm font-medium text-[--fg-primary] transition-colors duration-150 hover:text-[--brand-primary]"
                  >
                    {task.title}
                  </Link>
                  <p className="text-xs tabular-nums text-[--fg-secondary]">
                    {task.dueDate
                      ? t("due", { date: task.dueDate })
                      : t("noDueDate")}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusStyles(task.status)}`}
                >
                  {task.status.replaceAll("_", " ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
