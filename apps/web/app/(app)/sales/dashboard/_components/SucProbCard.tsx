"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKR } from "../../_lib/format";

type Item = { stepName: string; count: number; totalAmt: number };

export function SucProbCard({ data }: { data: Item[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="dash-suc-prob">
      <h3 className="text-sm font-semibold text-slate-700">영업단계 분포 (성공확률)</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="stepName" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip formatter={fmtKR} />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
