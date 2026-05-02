"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_PALETTE } from "@/lib/charts/palette";

type Item = { productTypeCode: string | null; productTypeName: string | null; totalAmt: number };

export function MarketingProductChart({ data }: { data: Item[] }) {
  if (data.length === 0) return null;
  const display = data.map((d) => ({
    name: d.productTypeName ?? d.productTypeCode ?? "(미분류)",
    amount: d.totalAmt,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={display}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.gridStroke} />
        <XAxis dataKey="name" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
        <Tooltip formatter={(v) => (typeof v === "number" ? `${v.toLocaleString()}원` : String(v))} />
        <Bar dataKey="amount" fill={CHART_PALETTE.amount} />
      </BarChart>
    </ResponsiveContainer>
  );
}
