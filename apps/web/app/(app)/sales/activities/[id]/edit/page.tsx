import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem, salesOpportunity } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getActivity } from "../../actions";
import { ActivityEditForm } from "./_components/ActivityEditForm";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows.map((r) => ({ code: r.code, label: r.name }));
}

async function loadOpportunityOptions(workspaceId: string) {
  const rows = await db
    .select({ id: salesOpportunity.id, bizOpNm: salesOpportunity.bizOpNm })
    .from(salesOpportunity)
    .where(eq(salesOpportunity.workspaceId, workspaceId))
    .orderBy(desc(salesOpportunity.insDate))
    .limit(500);
  return rows.map((r) => ({ code: r.id, label: r.bizOpNm }));
}

export default async function ActivityEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const { id } = await params;
  const [result, actTypeOptions, accessRouteOptions, bizStepOptions, productTypeOptions, opportunityOptions] = await Promise.all([
    getActivity({ id }),
    loadCodeOptions(session.workspaceId, "SALES_ACT_TYPE"),
    loadCodeOptions(session.workspaceId, "SALES_ACCESS_ROUTE"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_STEP"),
    loadCodeOptions(session.workspaceId, "SALES_PRODUCT_TYPE"),
    loadOpportunityOptions(session.workspaceId),
  ]);
  if (!result.ok) {
    redirect("/sales/activities?error=not-found");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Activities"
        title={result.activity.bizActNm}
        description="영업활동 상세 내용을 수정합니다."
      />
      <ActivityEditForm
        activity={result.activity}
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
