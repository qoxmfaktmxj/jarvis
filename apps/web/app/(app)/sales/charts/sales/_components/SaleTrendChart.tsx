"use client";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_PALETTE, SERIES_BY_GUBUN } from "@/lib/charts/palette";

type Row = { ym: string; plan: number; actual: number; forecast: number };

export function SaleTrendChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="ym" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
        <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : v} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="plan"     name={SERIES_BY_GUBUN[0].name} stroke={SERIES_BY_GUBUN[0].color} strokeWidth={2} dot={{ r: 2 }} />
        <Line dataKey="actual"   name={SERIES_BY_GUBUN[1].name} stroke={SERIES_BY_GUBUN[1].color} strokeWidth={2} dot={{ r: 2 }} />
        <Line dataKey="forecast" name={SERIES_BY_GUBUN[2].name} stroke={SERIES_BY_GUBUN[2].color} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
