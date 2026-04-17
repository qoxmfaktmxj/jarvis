import type { ReactNode } from "react";

/**
 * StatCard — compact stat card (flow-friendly).
 * No CardHeader/CardContent wrapper — uses semantic section with Tailwind-only styling.
 * Kept for backward compatibility; the dashboard page now uses bespoke widgets.
 */
export function StatCard({
  title,
  value,
  description,
  accent
}: {
  title: string;
  value: string;
  description?: string;
  accent?: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border border-surface-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {title}
        </h2>
        {accent}
      </div>
      <p className="text-display text-4xl font-bold leading-none tracking-tight text-surface-900">
        {value}
      </p>
      {description ? (
        <p className="text-sm text-surface-500">{description}</p>
      ) : null}
    </section>
  );
}
