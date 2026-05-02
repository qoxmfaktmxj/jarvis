import { getTranslations } from "next-intl/server";
import { getAdminPerf } from "../actions";
import { ChartCard } from "../_components/ChartCard";
import { EmptyChartState } from "../_components/EmptyChartState";
import { AdminPerfChart } from "./_components/AdminPerfChart";
import { AdminToggles } from "./_components/AdminToggles";

interface AdminPageProps {
  searchParams: Promise<{ year?: string; view?: string; metric?: string }>;
}

const VALID_VIEWS = ["year", "quarter"] as const;
const VALID_METRICS = ["SALES", "GROSS_PROFIT", "OP_INCOME"] as const;

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const t = await getTranslations("Sales.Charts.Admin");
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());
  const view = VALID_VIEWS.includes(sp.view as typeof VALID_VIEWS[number])
    ? (sp.view as typeof VALID_VIEWS[number]) : "year";
  const metric = VALID_METRICS.includes(sp.metric as typeof VALID_METRICS[number])
    ? (sp.metric as typeof VALID_METRICS[number]) : "SALES";

  const res = await getAdminPerf({ year, view, metric });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
        <form method="GET" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="view" defaultValue={view} />
          <input type="hidden" name="metric" defaultValue={metric} />
          <input
            name="year" defaultValue={year} type="number" min="2000" max="2100"
            className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
          />
        </form>
      </div>

      <ChartCard title={t("title")} filters={<AdminToggles view={view} metric={metric} />}>
        {res.ok && res.rows.some((r) => r.plan + r.actual + r.forecast > 0)
          ? <AdminPerfChart data={res.rows} />
          : <EmptyChartState />}
      </ChartCard>
    </div>
  );
}
