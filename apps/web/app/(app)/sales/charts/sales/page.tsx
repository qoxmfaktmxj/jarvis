import { getTranslations } from "next-intl/server";
import { getSaleTrend, getProfitTrend, getPlanPerfChart } from "../actions";
import { ChartCard } from "../_components/ChartCard";
import { EmptyChartState } from "../_components/EmptyChartState";
import { SaleTrendChart } from "./_components/SaleTrendChart";
import { ProfitTrendChart } from "./_components/ProfitTrendChart";
import { PlanPerfChart } from "./_components/PlanPerfChart";

interface SalesPageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function SalesChartsPage({ searchParams }: SalesPageProps) {
  const t = await getTranslations("Sales.Charts.Sales");
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());

  const [sale, profit, planPerf] = await Promise.all([
    getSaleTrend({ years: [year] }),
    getProfitTrend({ years: [year] }),
    getPlanPerfChart({ year }),
  ]);

  const hasData = (rows: { plan: number; actual: number; forecast: number }[]) =>
    rows.some((r) => r.plan + r.actual + r.forecast > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
        <form method="GET" className="ml-auto">
          <input
            name="year" defaultValue={year} type="number" min="2000" max="2100"
            className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
          />
        </form>
      </div>

      <ChartCard title={t("saleTrend")}>
        {sale.ok && hasData(sale.rows) ? <SaleTrendChart data={sale.rows} /> : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("profitTrend")}>
        {profit.ok && hasData(profit.rows) ? <ProfitTrendChart data={profit.rows} /> : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("planPerf")}>
        {planPerf.ok && hasData(planPerf.rows) ? <PlanPerfChart data={planPerf.rows} /> : <EmptyChartState />}
      </ChartCard>
    </div>
  );
}
