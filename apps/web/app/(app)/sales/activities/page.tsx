import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem, salesOpportunity } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ActivitiesGridContainer } from "./_components/ActivitiesGridContainer";
import { listActivities } from "./actions";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

async function loadOpportunityOptions(workspaceId: string) {
  const rows = await db
    .select({ id: salesOpportunity.id, bizOpNm: salesOpportunity.bizOpNm })
    .from(salesOpportunity)
    .where(eq(salesOpportunity.workspaceId, workspaceId))
    .orderBy(desc(salesOpportunity.insDate))
    .limit(500);
  return rows.map((r) => ({ value: r.id, label: r.bizOpNm }));
}

export default async function SalesActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const limit = 50;
  const filters = {
    q: sp.q,
    opportunityId: sp.opportunityId,
    actTypeCode: sp.actTypeCode,
    bizStepCode: sp.bizStepCode,
  };

  const [
    listResult,
    actTypeOptions,
    accessRouteOptions,
    bizStepOptions,
    productTypeOptions,
    opportunityOptions,
  ] = await Promise.all([
    listActivities({ page, limit, ...filters }),
    loadCodeOptions(session.workspaceId, "SALES_ACT_TYPE"),
    loadCodeOptions(session.workspaceId, "SALES_ACCESS_ROUTE"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_STEP"),
    loadCodeOptions(session.workspaceId, "SALES_PRODUCT_TYPE"),
    loadOpportunityOptions(session.workspaceId),
  ]);

  const initialRows = "ok" in listResult && listResult.ok ? listResult.rows : [];
  const initialTotal = "ok" in listResult && listResult.ok ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Activities"
        title="영업활동"
        description="영업활동(BizAct) 마스터를 관리합니다."
      />
      <ActivitiesGridContainer
        initial={initialRows}
        total={initialTotal}
        page={page}
        limit={limit}
        initialFilters={filters}
        codeOptions={{
          actType: actTypeOptions,
          accessRoute: accessRouteOptions,
          bizStep: bizStepOptions,
          productType: productTypeOptions,
        }}
        opportunityOptions={opportunityOptions}
      />
    </div>
  );
}
