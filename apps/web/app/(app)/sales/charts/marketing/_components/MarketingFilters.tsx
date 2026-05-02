"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// TODO(P2-7): Replace with `lib/queries/organizations.ts` once it lands.
// For now this is a hardcoded stub of 5 dummy orgs matching legacy SALES_ORG codes.
const ORG_STUB: { value: string; label: string }[] = [
  { value: "ORG_DEV", label: "개발실" },
  { value: "ORG_SALES1", label: "영업1팀" },
  { value: "ORG_SALES2", label: "영업2팀" },
  { value: "ORG_BIZ", label: "사업기획팀" },
  { value: "ORG_MGMT", label: "경영지원팀" },
];

export function MarketingFilters({ defaultYm }: { defaultYm: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const t = useTranslations("Sales.Charts.Marketing.filters");
  const ym = params.get("ym") ?? defaultYm;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const onChange = (next: string) => {
    if (!/^\d{6}$/.test(next)) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("ym", next);
    startTransition(() => router.replace(`?${sp.toString()}`));
  };

  const set = (key: string, val: string) => {
    const sp = new URLSearchParams(params.toString());
    if (val) sp.set(key, val);
    else sp.delete(key);
    startTransition(() => router.replace(`?${sp.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
      <label className="flex flex-col text-xs text-slate-600">
        기준년월 (YYYYMM)
        <input
          className="mt-1 h-8 w-32 rounded border border-slate-200 px-2 text-sm"
          defaultValue={ym}
          onBlur={(e) => onChange(e.target.value)}
          placeholder="202604"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        {t("year")}
        <select
          className="mt-1 h-8 w-24 rounded border border-slate-200 px-2 text-sm"
          defaultValue={params.get("year") ?? String(currentYear)}
          onChange={(e) => set("year", e.target.value)}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        {t("org")}
        <select
          className="mt-1 h-8 w-40 rounded border border-slate-200 px-2 text-sm"
          defaultValue={params.get("orgCd") ?? ""}
          onChange={(e) => set("orgCd", e.target.value)}
        >
          <option value="">{t("orgAll")}</option>
          {ORG_STUB.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {pending ? <span className="text-xs text-slate-500">로딩…</span> : null}
    </div>
  );
}
