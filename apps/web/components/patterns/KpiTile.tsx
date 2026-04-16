import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiTileProps = {
  label: string;
  value: ReactNode;
  trend?: { direction: "up" | "down" | "flat"; pct: number };
  accent?: "brand" | "lime" | "surface";
  footnote?: string;
};

const accentStyles: Record<NonNullable<KpiTileProps["accent"]>, string> = {
  brand: "text-isu-600",
  lime: "text-lime-600",
  surface: "text-surface-900",
};

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export function KpiTile({ label, value, trend, accent = "surface", footnote }: KpiTileProps) {
  const TrendIcon = trend ? trendIcons[trend.direction] : null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-surface-200 bg-white p-5">
      <p className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </p>
      <p className={`text-display text-4xl font-bold leading-none tracking-tight ${accentStyles[accent]}`}>
        {value}
      </p>
      {trend && TrendIcon ? (
        <p className="flex items-center gap-1 text-xs text-surface-600">
          <TrendIcon
            className={`h-3.5 w-3.5 ${
              trend.direction === "up" ? "text-lime-600" : trend.direction === "down" ? "text-danger" : "text-surface-400"
            }`}
            aria-hidden
          />
          <span>{trend.pct}%</span>
        </p>
      ) : null}
      {footnote ? <p className="text-xs text-surface-400">{footnote}</p> : null}
    </section>
  );
}
