import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import {
  getDashboardBA,
  getDashboardOpIncome,
  getDashboardSalesTrend,
  getDashboardSucProb,
} from "./actions";
import { SalesTrendCard } from "./_components/SalesTrendCard";
import { SucProbCard } from "./_components/SucProbCard";
import { OpIncomeCard } from "./_components/OpIncomeCard";
import { BACard } from "./_components/BACard";

function defaultYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function loadCodeMap(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)));
  return new Map(rows.map((r) => [r.code, r.name]));
}

export default async function SalesDashboardPage() {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.Charts.Dashboard");
  const ym = defaultYm();
  const year = new Date().getFullYear();

  const [trendRes, sucProbRes, opIncomeRes, baRes, stepMap] = await Promise.all([
    getDashboardSalesTrend({ years: [year - 2, year - 1, year] }),
    getDashboardSucProb({ ym }),
    getDashboardOpIncome({ year }),
    getDashboardBA({ ym }),
    loadCodeMap(session.workspaceId, "SALES_BIZ_STEP"),
  ]);

  const sucProbRows =
    sucProbRes.ok
      ? sucProbRes.rows.map((r) => ({
          stepName:
            r.bizStepCode != null ? (stepMap.get(r.bizStepCode) ?? r.bizStepCode) : "(미설정)",
          count: r.count,
          totalAmt: r.totalAmt,
        }))
      : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Dashboard" title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {trendRes.ok ? (
          <SalesTrendCard months={trendRes.months} series={trendRes.series} />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
            매출 트렌드 데이터 없음
          </div>
        )}
        <SucProbCard data={sucProbRows} />
        {opIncomeRes.ok ? (
          <OpIncomeCard
            months={opIncomeRes.months}
            plan={opIncomeRes.plan}
            actual={opIncomeRes.actual}
            forecast={opIncomeRes.forecast}
          />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
            영업이익 데이터 없음
          </div>
        )}
        {baRes.ok ? (
          <BACard
            activityCount={baRes.activityCount}
            opportunityCount={baRes.opportunityCount}
            opportunityAmt={baRes.opportunityAmt}
            byOrg={baRes.byOrg.map((b) => ({ orgNm: b.orgNm ?? "(미설정)", opportunityCount: b.opportunityCount }))}
          />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">BA 데이터 없음</div>
        )}
      </div>
    </div>
  );
}
