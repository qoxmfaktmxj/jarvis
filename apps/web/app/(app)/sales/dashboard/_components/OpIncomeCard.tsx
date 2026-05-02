"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKR } from "../../_lib/format";

export function OpIncomeCard({
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
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="dash-op-income">
      <h3 className="text-sm font-semibold text-slate-700">영업이익 (계획 / 실적 / 전망)</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={fmtKR} />
            <Tooltip formatter={fmtKR} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="PLAN" name="계획" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ACTUAL" name="실적" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="FORECAST" name="전망" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
