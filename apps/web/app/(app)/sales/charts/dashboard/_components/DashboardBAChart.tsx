"use client";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_PALETTE, SERIES_BY_GUBUN } from "@/lib/charts/palette";

type Row = { orgNm: string; plan: number; actual: number };

export function DashboardBAChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="orgNm" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
        <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : v} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="plan"   name={SERIES_BY_GUBUN[0].name} fill={SERIES_BY_GUBUN[0].color} />
        <Bar dataKey="actual" name={SERIES_BY_GUBUN[1].name} fill={SERIES_BY_GUBUN[1].color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
