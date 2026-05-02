"use client";
import {
  Bar, ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_PALETTE, SERIES_BY_GUBUN } from "@/lib/charts/palette";

type Row = { period: string; plan: number; actual: number; forecast: number };

export function AdminPerfChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="period" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
        <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : v} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar    dataKey="plan"     name={SERIES_BY_GUBUN[0].name} fill={SERIES_BY_GUBUN[0].color} />
        <Bar    dataKey="actual"   name={SERIES_BY_GUBUN[1].name} fill={SERIES_BY_GUBUN[1].color} />
        <Line   dataKey="forecast" name={SERIES_BY_GUBUN[2].name} stroke={SERIES_BY_GUBUN[2].color} strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
