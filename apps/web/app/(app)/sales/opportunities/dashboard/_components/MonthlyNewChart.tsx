"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Item = { ym: string; cnt: number };

export function MonthlyNewChart({ data }: { data: Item[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">월별 신규 영업기회</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ym" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="cnt" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
