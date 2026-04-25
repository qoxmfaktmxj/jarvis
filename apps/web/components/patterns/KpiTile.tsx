import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * KpiTile — two overlapping APIs intentionally supported:
 *
 * 1) New prototype (app.jsx `Kpi`): `tone` + `trend: number[]` + `delta: string`.
 *    Renders a mono uppercase label, large 28px value with inline delta,
 *    and a 120×36 SVG sparkline tinted by `tone`.
 *
 * 2) Legacy: `accent` + `trend: { direction, pct }` + `footnote`.
 *    Existing widgets keep working; newer pages should prefer (1).
 */
export type KpiTone = "mint" | "accent" | "amber" | "neutral";

type TrendObject = { direction: "up" | "down" | "flat"; pct: number };

export type KpiTileProps = {
  label: string;
  value: ReactNode;
  /** New: 12-point sparkline values. Legacy: {direction,pct}. */
  trend?: number[] | TrendObject;
  /** New API. */
  tone?: KpiTone;
  /** New API — short ± string next to the value, tone-tinted. */
  delta?: string;
  /** Legacy — accent preset. */
  accent?: "brand" | "lime" | "surface";
  /** Legacy — small note below. */
  footnote?: string;
};

const toneVar: Record<KpiTone, string> = {
  mint: "var(--mint)",
  accent: "var(--accent)",
  amber: "var(--amber, var(--accent))",
  neutral: "var(--ink)",
};

const legacyAccent: Record<NonNullable<KpiTileProps["accent"]>, string> = {
  brand: "text-[--brand-primary-text]",
  lime: "text-[--brand-primary-text]",
  surface: "text-[--fg-primary]",
};

const trendIcons = { up: TrendingUp, down: TrendingDown, flat: Minus };

function isTrendArray(t: KpiTileProps["trend"]): t is number[] {
  return Array.isArray(t);
}

function sparklinePoints(values: number[]): string {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => `${(i / (values.length - 1)) * 120},${36 - ((v - min) / range) * 36}`)
    .join(" ");
}

export function KpiTile(props: KpiTileProps) {
  const { label, value, trend, tone, delta, accent = "surface", footnote } = props;

  // ─── Mode A: app.jsx prototype (tone + sparkline array) ───
  if (tone !== undefined || delta !== undefined || isTrendArray(trend)) {
    const t: KpiTone = tone ?? "neutral";
    const strokeColor = toneVar[t];
    const points = isTrendArray(trend) && trend.length > 1 ? sparklinePoints(trend) : null;

    return (
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--muted)",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em" }}>{value}</div>
          {delta ? (
            <span
              className="mono"
              style={{ fontSize: 11.5, color: strokeColor, marginBottom: 6 }}
            >
              {delta}
            </span>
          ) : null}
        </div>
        {points ? (
          <svg width={120} height={36} style={{ marginTop: 8 }} aria-hidden="true">
            <polyline fill="none" stroke={strokeColor} strokeWidth="1.5" points={points} />
            <polyline
              fill={strokeColor}
              fillOpacity=".1"
              stroke="none"
              points={`0,36 ${points} 120,36`}
            />
          </svg>
        ) : null}
      </div>
    );
  }

  // ─── Mode B: legacy (accent + trend object + footnote) ───
  const trendObj = (trend as TrendObject | undefined) ?? undefined;
  const TrendIcon = trendObj ? trendIcons[trendObj.direction] : null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[--border-default] bg-card p-5">
      <p className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
        {label}
      </p>
      <p
        className={`text-display text-4xl font-bold leading-none tracking-tight ${legacyAccent[accent]}`}
      >
        {value}
      </p>
      {trendObj && TrendIcon ? (
        <p className="flex items-center gap-1 text-xs text-[--fg-secondary]">
          <TrendIcon
            className={`h-3.5 w-3.5 ${
              trendObj.direction === "up"
                ? "text-[--brand-primary-text]"
                : trendObj.direction === "down"
                  ? "text-danger"
                  : "text-[--fg-muted]"
            }`}
            aria-hidden
          />
          <span>{trendObj.pct}%</span>
        </p>
      ) : null}
      {footnote ? <p className="text-xs text-[--fg-muted]">{footnote}</p> : null}
    </section>
  );
}
