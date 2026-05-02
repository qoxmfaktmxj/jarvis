export const CHART_PALETTE = {
  plan:     "#94a3b8", // slate-400 (target / baseline)
  actual:   "#3b82f6", // blue-500 (primary)
  forecast: "#f59e0b", // amber-500
  count:    "#10b981", // emerald-500
  amount:   "#6366f1", // indigo-500
  gridStroke: "#e2e8f0", // slate-200
} as const;

export const SERIES_BY_GUBUN = [
  { key: "plan",     name: "계획",   color: CHART_PALETTE.plan },
  { key: "actual",   name: "실적",   color: CHART_PALETTE.actual },
  { key: "forecast", name: "전망",   color: CHART_PALETTE.forecast },
] as const;
