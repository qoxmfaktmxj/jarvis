import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { TrendGbEnum } from "@jarvis/shared/validation/sales-charts";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getTrend } from "./actions";
import { TrendChart } from "./_components/TrendChart";
import { TrendTabs } from "./_components/TrendTabs";

type SearchParams = { metric?: string; years?: string };

function parseYears(raw: string | undefined): number[] {
  const now = new Date().getFullYear();
  if (!raw) return [now - 2, now - 1, now];
  const ys = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100);
  if (ys.length === 0) return [now - 2, now - 1, now];
  return ys.slice(0, 5);
}

export default async function SalesChartsTrendPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.Charts.Trend");
  const params = await searchParams;
  const metricParse = TrendGbEnum.safeParse(params.metric);
  const metric = metricParse.success ? metricParse.data : "SALES";
  const years = parseYears(params.years);

  const result = await getTrend({ years, metric });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Charts" title={t("title")} description={t("description")} />
      <TrendTabs active={metric} />
      {result.ok ? (
        <TrendChart months={result.months} series={result.series} />
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          데이터를 불러올 수 없습니다.
        </div>
      )}
    </div>
  );
}
