"use client";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_PALETTE } from "@/lib/charts/palette";

type Row = { ym: string; opIncome: number };

export function DashboardOpIncomeChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="ym" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
        <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : v} />
        <Line dataKey="opIncome" stroke={CHART_PALETTE.amount} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
