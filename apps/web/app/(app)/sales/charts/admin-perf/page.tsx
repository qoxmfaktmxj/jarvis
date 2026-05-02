import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { TrendGbEnum, ViewEnum } from "@jarvis/shared/validation/sales-charts";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getAdminPerf } from "./actions";
import { AdminPerfChart } from "./_components/AdminPerfChart";
import { AdminPerfFilters } from "./_components/AdminPerfFilters";

type SearchParams = { year?: string; view?: string; metric?: string };

export default async function SalesChartsAdminPerfPage({
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

  const t = await getTranslations("Sales.Charts.AdminPerf");
  const params = await searchParams;
  const yearNum = Number(params.year);
  const year = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : new Date().getFullYear();
  const viewParse = ViewEnum.safeParse(params.view);
  const view = viewParse.success ? viewParse.data : "year";
  const metricParse = TrendGbEnum.safeParse(params.metric);
  const metric = metricParse.success ? metricParse.data : "SALES";

  const result = await getAdminPerf({ year, view, metric });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Charts" title={t("title")} description={t("description")} />
      <AdminPerfFilters defaults={{ year, view, metric }} />
      {result.ok ? (
        <AdminPerfChart buckets={result.buckets} rows={result.rows} />
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          데이터를 불러올 수 없습니다.
        </div>
      )}
    </div>
  );
}
