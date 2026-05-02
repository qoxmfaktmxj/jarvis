"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function MarketingFilters({ defaultYm }: { defaultYm: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const ym = params.get("ym") ?? defaultYm;

  const onChange = (next: string) => {
    if (!/^\d{6}$/.test(next)) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("ym", next);
    startTransition(() => router.replace(`?${sp.toString()}`));
  };

  return (
    <div className="flex items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
      <label className="flex flex-col text-xs text-slate-600">
        기준년월 (YYYYMM)
        <input
          className="mt-1 h-8 w-32 rounded border border-slate-200 px-2 text-sm"
          defaultValue={ym}
          onBlur={(e) => onChange(e.target.value)}
          placeholder="202604"
        />
      </label>
      {pending ? <span className="text-xs text-slate-500">로딩…</span> : null}
    </div>
  );
}
