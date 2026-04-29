"use client";

import { cn } from "@/lib/utils";

interface AskContextGaugeProps {
  usedTokens: number;
  totalWindow: number;
  className?: string;
}

function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

export function AskContextGauge({
  usedTokens,
  totalWindow,
  className,
}: AskContextGaugeProps) {
  const rawPct =
    totalWindow > 0 ? Math.round((usedTokens / totalWindow) * 100) : 0;
  const pct = Math.min(100, Math.max(0, rawPct));

  const tone =
    pct >= 90
      ? "bg-danger"
      : pct >= 75
        ? "bg-warning"
        : "bg-(--brand-primary)";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] text-(--fg-secondary)",
        className,
      )}
      aria-label={`컨텍스트 ${pct}% · ${formatTokens(usedTokens)} / ${formatTokens(
        totalWindow,
      )} 토큰`}
      title={`${formatTokens(usedTokens)} / ${formatTokens(totalWindow)} 토큰`}
    >
      <span
        className="relative inline-flex h-1 w-12 overflow-hidden rounded-full bg-(--bg-surface)"
        aria-hidden
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-300", tone)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}
