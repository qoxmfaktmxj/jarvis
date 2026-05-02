"use client";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtKR } from "../../../_lib/format";

type Item = { productTypeName: string; totalAmt: number };

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316"];

export function MarketingProductChart({ data }: { data: Item[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="marketing-product-chart">
      <h3 className="text-sm font-semibold text-slate-700">상품 유형별 계약예상금액</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="totalAmt"
              nameKey="productTypeName"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={(props: { name?: unknown }) => (typeof props.name === "string" ? props.name : "")}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={fmtKR} />
            <Legend wrapperStyle={{ whiteSpace: "normal", paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
