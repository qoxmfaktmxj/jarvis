"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_PALETTE } from "@/lib/charts/palette";

type Item = { activityTypeCode: string | null; activityTypeName: string | null; count: number };

export function MarketingActivityChart({ data }: { data: Item[] }) {
  if (data.length === 0) return null;
  const display = data.map((d) => ({
    name: d.activityTypeName ?? d.activityTypeCode ?? "(미분류)",
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={display}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="name" fontSize={11} />
        <YAxis fontSize={11} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill={CHART_PALETTE.count} />
      </BarChart>
    </ResponsiveContainer>
  );
}
