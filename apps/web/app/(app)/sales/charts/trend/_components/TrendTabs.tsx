"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Metric = "SALES" | "GROSS_PROFIT" | "OP_INCOME";

const TABS: { metric: Metric; label: string }[] = [
  { metric: "SALES", label: "매출 트렌드" },
  { metric: "OP_INCOME", label: "영업이익 트렌드" },
];

export function TrendTabs({ active }: { active: Metric }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const switchTo = (metric: Metric) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("metric", metric);
    startTransition(() => router.replace(`?${sp.toString()}`));
  };

  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const isActive = t.metric === active;
        return (
          <button
            key={t.metric}
            onClick={() => switchTo(t.metric)}
            className={
              isActive
                ? "border-b-2 border-blue-500 px-4 py-2 text-sm font-semibold text-blue-700"
                : "border-b-2 border-transparent px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            }
            data-testid={`trend-tab-${t.metric}`}
          >
            {t.label}
          </button>
        );
      })}
      {pending ? <span className="ml-2 text-xs text-slate-500">로딩…</span> : null}
    </div>
  );
}
