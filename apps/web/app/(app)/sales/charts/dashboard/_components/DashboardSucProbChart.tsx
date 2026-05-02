"use client";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_PALETTE } from "@/lib/charts/palette";

type Row = { gradeCode: string | null; gradeName?: string | null; count: number; totalAmt: number };

export function DashboardSucProbChart({ data }: { data: Row[] }) {
  const display = data.map((d) => ({
    name: d.gradeName ?? d.gradeCode ?? "(미분류)",
    count: d.count,
    amount: d.totalAmt,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
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
