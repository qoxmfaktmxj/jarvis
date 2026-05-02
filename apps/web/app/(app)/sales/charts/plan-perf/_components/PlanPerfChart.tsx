"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKR } from "../../../_lib/format";

export function PlanPerfChart({
  months,
  plan,
  actual,
  forecast,
}: {
  months: string[];
  plan: number[];
  actual: number[];
  forecast: number[];
}) {
  const data = months.map((m, i) => ({
    month: m,
    PLAN: plan[i] ?? 0,
    ACTUAL: actual[i] ?? 0,
    FORECAST: forecast[i] ?? 0,
  }));

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="plan-perf-chart">
      <h3 className="text-sm font-semibold text-slate-700">월별 계획 · 실적 · 전망</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={fmtKR} />
            <Tooltip formatter={fmtKR} />
            <Legend wrapperStyle={{ fontSize: 11, whiteSpace: "normal", paddingTop: 8 }} />
            <Bar dataKey="PLAN" name="계획" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ACTUAL" name="실적" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="FORECAST" name="전망" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
