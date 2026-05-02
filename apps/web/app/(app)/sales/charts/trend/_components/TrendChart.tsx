"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKR } from "../../../_lib/format";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

type Series = { year: number; values: number[] };

export function TrendChart({ months, series }: { months: string[]; series: Series[] }) {
  const data = months.map((m, i) => {
    const obj: Record<string, string | number> = { month: m };
    for (const s of series) obj[String(s.year)] = s.values[i] ?? 0;
    return obj;
  });

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="trend-chart">
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={fmtKR} />
            <Tooltip formatter={fmtKR} />
            <Legend wrapperStyle={{ fontSize: 11, whiteSpace: "normal", paddingTop: 8 }} />
            {series.map((s, i) => (
              <Line
                key={s.year}
                type="monotone"
                dataKey={String(s.year)}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
