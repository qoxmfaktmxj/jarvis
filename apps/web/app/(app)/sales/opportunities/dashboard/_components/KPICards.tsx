"use client";

type KPIs = { total: number; inProgressAmt: number; monthNew: number; focus: number };

export function KPICards({ kpis }: { kpis: KPIs }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPI label="전체 영업기회" value={kpis.total.toLocaleString("ko-KR")} />
      <KPI label="진행 중 예상금액" value={`₩${(kpis.inProgressAmt / 1e8).toFixed(1)}억`} />
      <KPI label="이번달 신규" value={kpis.monthNew.toLocaleString("ko-KR")} />
      <KPI label="집중관리" value={kpis.focus.toLocaleString("ko-KR")} />
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
