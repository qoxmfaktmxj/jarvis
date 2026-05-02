import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import {
  getDashboardSalesTrend, getDashboardSucProb, getDashboardSucProbHap,
  getDashboardOpIncome, getDashboardBA,
} from "../actions";
import { ChartCard } from "../_components/ChartCard";
import { EmptyChartState } from "../_components/EmptyChartState";
import { DashboardSalesChart } from "./_components/DashboardSalesChart";
import { DashboardSucProbChart } from "./_components/DashboardSucProbChart";
import { DashboardSucProbHapChart } from "./_components/DashboardSucProbHapChart";
import { DashboardOpIncomeChart } from "./_components/DashboardOpIncomeChart";
import { DashboardBAChart } from "./_components/DashboardBAChart";

interface DashboardPageProps {
  searchParams: Promise<{ year?: string; ym?: string }>;
}

async function loadCodeNames(workspaceId: string, groupCode: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)));
  return new Map(rows.map((r) => [r.code, r.name]));
}

function defaultYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DashboardChartsPage({ searchParams }: DashboardPageProps) {
  const t = await getTranslations("Sales.Charts.Dashboard");
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());
  const ym = sp.ym ?? defaultYm();

  // session for code lookup workspace
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  const wsId = session?.workspaceId ?? "";

  const [sales, opIncome, ba, sucProb, sucProbHap, gradeNames, hapNames] = await Promise.all([
    getDashboardSalesTrend({ years: [year] }),
    getDashboardOpIncome({ year }),
    getDashboardBA({ ym }),
    getDashboardSucProb({ ym }),
    getDashboardSucProbHap({ ym }),
    wsId ? loadCodeNames(wsId, "B10026") : Promise.resolve(new Map<string, string>()),
    wsId ? loadCodeNames(wsId, "B10027") : Promise.resolve(new Map<string, string>()),
  ]);

  const hasGubun = (rows: { plan: number; actual: number; forecast?: number }[]) =>
    rows.some((r) => r.plan + r.actual + (r.forecast ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
        <form method="GET" className="ml-auto flex items-center gap-2">
          <input
            name="year" defaultValue={year} type="number" min="2000" max="2100"
            className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
            aria-label="year"
          />
          <input
            name="ym" defaultValue={ym} pattern="\d{6}"
            className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
            aria-label="ym"
          />
        </form>
      </div>

      <ChartCard title={t("sales")}>
        {sales.ok && hasGubun(sales.rows) ? <DashboardSalesChart data={sales.rows} /> : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("sucProb")}>
        {sucProb.ok && sucProb.rows.length > 0
          ? <DashboardSucProbChart data={sucProb.rows.map((r) => ({ ...r, gradeName: r.gradeCode ? gradeNames.get(r.gradeCode) ?? null : null }))} />
          : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("sucProbHap")}>
        {sucProbHap.ok && sucProbHap.rows.length > 0
          ? <DashboardSucProbHapChart data={sucProbHap.rows.map((r) => ({ ...r, gradeName: r.gradeCode ? hapNames.get(r.gradeCode) ?? null : null }))} />
          : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("opIncome")}>
        {opIncome.ok && opIncome.rows.some((r) => r.opIncome > 0)
          ? <DashboardOpIncomeChart data={opIncome.rows} />
          : <EmptyChartState />}
      </ChartCard>
      <ChartCard title={t("ba")}>
        {ba.ok && ba.rows.length > 0 ? <DashboardBAChart data={ba.rows} /> : <EmptyChartState />}
      </ChartCard>
    </div>
  );
}
