"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type View = "year" | "quarter";
type Metric = "SALES" | "GROSS_PROFIT" | "OP_INCOME";

function buildHref(params: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(params);
  next.set(key, value);
  return `?${next.toString()}`;
}

export function AdminToggles({ view, metric }: { view: View; metric: Metric }) {
  const sp = useSearchParams();
  const t = useTranslations("Sales.Charts.Admin");
  const base = sp ?? new URLSearchParams();

  const ViewBtn = ({ value, label }: { value: View; label: string }) => (
    <Link
      href={buildHref(base, "view", value)}
      className={[
        "inline-block px-2 py-1 text-xs rounded border",
        view === value ? "border-blue-500 text-blue-600 bg-blue-50" : "border-slate-300 text-slate-600",
      ].join(" ")}
    >{label}</Link>
  );
  const MetricBtn = ({ value, label }: { value: Metric; label: string }) => (
    <Link
      href={buildHref(base, "metric", value)}
      className={[
        "inline-block px-2 py-1 text-xs rounded border",
        metric === value ? "border-blue-500 text-blue-600 bg-blue-50" : "border-slate-300 text-slate-600",
      ].join(" ")}
    >{label}</Link>
  );

  return (
    <>
      <div className="flex items-center gap-1">
        <ViewBtn value="year" label={t("viewYear")} />
        <ViewBtn value="quarter" label={t("viewQuarter")} />
      </div>
      <div className="flex items-center gap-1">
        <MetricBtn value="SALES" label={t("metricSales")} />
        <MetricBtn value="GROSS_PROFIT" label={t("metricGross")} />
        <MetricBtn value="OP_INCOME" label={t("metricOpIncome")} />
      </div>
    </>
  );
}
