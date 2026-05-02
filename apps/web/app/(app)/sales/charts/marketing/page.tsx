import { getTranslations } from "next-intl/server";
import { getMarketingByActivity, getMarketingByProduct } from "../actions";
import { ChartCard } from "../_components/ChartCard";
import { EmptyChartState } from "../_components/EmptyChartState";
import { MarketingActivityChart } from "./_components/MarketingActivityChart";
import { MarketingProductChart } from "./_components/MarketingProductChart";

interface MarketingPageProps {
  searchParams: Promise<{ ym?: string }>;
}

function defaultYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function MarketingPage({ searchParams }: MarketingPageProps) {
  const t = await getTranslations("Sales.Charts.Marketing");
  const sp = await searchParams;
  const ym = sp.ym ?? defaultYm();

  const [activity, product] = await Promise.all([
    getMarketingByActivity({ ym }),
    getMarketingByProduct({ ym }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
        <form method="GET" className="ml-auto flex items-center gap-2">
          <label htmlFor="ym" className="text-xs text-slate-600">{t("ymLabel")}</label>
          <input
            id="ym"
            name="ym"
            defaultValue={ym}
            className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
            pattern="\d{6}"
            placeholder="YYYYMM"
          />
        </form>
      </div>

      <ChartCard title={t("byActivity")}>
        {activity.ok && activity.rows.length > 0
          ? <MarketingActivityChart data={activity.rows} />
          : <EmptyChartState />}
      </ChartCard>

      <ChartCard title={t("byProduct")}>
        {product.ok && product.rows.length > 0
          ? <MarketingProductChart data={product.rows} />
          : <EmptyChartState />}
      </ChartCard>
    </div>
  );
}
