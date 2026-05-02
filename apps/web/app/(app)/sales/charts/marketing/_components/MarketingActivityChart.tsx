"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Item = { activityTypeName: string; count: number };

export function MarketingActivityChart({ data }: { data: Item[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="marketing-activity-chart">
      <h3 className="text-sm font-semibold text-slate-700">활동 유형별 건수</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="activityTypeName" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
