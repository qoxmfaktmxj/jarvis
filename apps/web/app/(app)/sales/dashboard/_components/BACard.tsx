"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Item = { orgNm: string; opportunityCount: number };

export function BACard({
  activityCount,
  opportunityCount,
  opportunityAmt,
  byOrg,
}: {
  activityCount: number;
  opportunityCount: number;
  opportunityAmt: number;
  byOrg: Item[];
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4" data-testid="dash-ba">
      <h3 className="text-sm font-semibold text-slate-700">영업활동 vs 영업기회 (BA)</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-slate-200 p-2">
          <div className="text-xs text-slate-500">활동 건수</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{activityCount.toLocaleString("ko-KR")}</div>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <div className="text-xs text-slate-500">기회 건수</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{opportunityCount.toLocaleString("ko-KR")}</div>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <div className="text-xs text-slate-500">기회 금액</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{opportunityAmt.toLocaleString("ko-KR")}</div>
        </div>
      </div>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byOrg}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="orgNm" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="opportunityCount" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
