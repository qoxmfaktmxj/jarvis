import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { getOpportunityDashboard } from "./actions";
import { KPICards } from "./_components/KPICards";
import { StepDistributionChart } from "./_components/StepDistributionChart";
import { MonthlyNewChart } from "./_components/MonthlyNewChart";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows;
}

export default async function DashboardPage() {
  const session = await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const [data, stepCodes] = await Promise.all([
    getOpportunityDashboard(),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_STEP"),
  ]);

  if (!data.ok) {
    redirect("/dashboard?error=forbidden");
  }

  const stepLookup = new Map(stepCodes.map((c) => [c.code, c.name]));
  const byStepWithNames = data.byStep.map((b) => ({
    stepCode: b.stepCode,
    stepName: b.stepCode ? (stepLookup.get(b.stepCode) ?? b.stepCode) : "(미설정)",
    cnt: b.cnt,
  }));
  const monthlyNew = data.monthlyNew.map((m) => ({ ym: m.ym, cnt: m.cnt }));

  return (
    <div className="space-y-3">
      <PageHeader title="영업기회현황" />
      <KPICards kpis={data.kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StepDistributionChart data={byStepWithNames} />
        <MonthlyNewChart data={monthlyNew} />
      </div>
    </div>
  );
}
