"use client";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKR } from "../../../_lib/format";

type Series = "PLAN" | "ACTUAL" | "FORECAST";
type Row = { orgCd: string; orgNm: string; series: Series; values: number[] };

const COLORS: Record<Series, string> = {
  PLAN: "#94a3b8",
  ACTUAL: "#3b82f6",
  FORECAST: "#f59e0b",
};

const LABELS: Record<Series, string> = { PLAN: "계획", ACTUAL: "실적", FORECAST: "전망" };

export function AdminPerfChart({ buckets, rows }: { buckets: string[]; rows: Row[] }) {
  const t = useTranslations("Sales.Charts.AdminPerf");
  // Pivot to bucket-major rows for Recharts: [{ bucket, [orgCd|series]: value, ... }]
  const data = buckets.map((bucket, i) => {
    const obj: Record<string, string | number> = { bucket };
    for (const r of rows) {
      const key = `${r.orgNm}·${LABELS[r.series]}`;
      obj[key] = r.values[i] ?? 0;
    }
    return obj;
  });

  // Stable bar order: per org, PLAN | ACTUAL | FORECAST
  const orgGroups = Array.from(new Set(rows.map((r) => r.orgNm)));
  const barKeys = orgGroups.flatMap((org) =>
    (["PLAN", "ACTUAL", "FORECAST"] as Series[]).map((s) => ({ key: `${org}·${LABELS[s]}`, color: COLORS[s] })),
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="admin-perf-chart">
      <h3 className="text-sm font-semibold text-slate-700">{t("stackedTitle")}</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={fmtKR} />
            <Tooltip formatter={fmtKR} />
            <Legend wrapperStyle={{ fontSize: 11, whiteSpace: "normal", paddingTop: 8 }} />
            {barKeys.map((b) => (
              <Bar key={b.key} dataKey={b.key} fill={b.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
