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
    <section className="flex h-full flex-col gap-3 rounded-xl border border-[--border-default] bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
          {title}
        </h2>
        {accent}
      </div>
      <p className="text-display text-4xl font-bold leading-none tracking-tight text-[--fg-primary]">
        {value}
      </p>
      {description ? (
        <p className="text-sm text-[--fg-secondary]">{description}</p>
      ) : null}
    </section>
  );
}
