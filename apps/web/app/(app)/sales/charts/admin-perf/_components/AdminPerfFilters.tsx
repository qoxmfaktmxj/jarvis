"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Metric = "SALES" | "GROSS_PROFIT" | "OP_INCOME";
type View = "year" | "quarter";

const METRIC_LABEL: Record<Metric, string> = {
  SALES: "매출",
  GROSS_PROFIT: "매출총이익",
  OP_INCOME: "영업이익",
};

export function AdminPerfFilters({ defaults }: { defaults: { year: number; view: View; metric: Metric } }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, val: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(key, val);
    startTransition(() => router.replace(`?${sp.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
      <label className="flex flex-col text-xs text-slate-600">
        년도
        <input
          type="number"
          className="mt-1 h-8 w-24 rounded border border-slate-200 px-2 text-sm"
          defaultValue={params.get("year") ?? String(defaults.year)}
          onBlur={(e) => set("year", e.target.value)}
        />
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        보기
        <select
          className="mt-1 h-8 w-24 rounded border border-slate-200 px-2 text-sm"
          defaultValue={params.get("view") ?? defaults.view}
          onChange={(e) => set("view", e.target.value)}
        >
          <option value="year">연(월별)</option>
          <option value="quarter">분기</option>
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        지표
        <select
          className="mt-1 h-8 w-32 rounded border border-slate-200 px-2 text-sm"
          defaultValue={params.get("metric") ?? defaults.metric}
          onChange={(e) => set("metric", e.target.value)}
        >
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <option key={m} value={m}>
              {METRIC_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {pending ? <span className="text-xs text-slate-500">로딩…</span> : null}
    </div>
  );
}
