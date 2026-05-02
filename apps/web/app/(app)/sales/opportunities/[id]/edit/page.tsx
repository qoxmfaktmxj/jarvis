import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getOpportunity } from "../../actions";
import { OpportunityEditForm } from "./_components/OpportunityEditForm";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows.map((r) => ({ code: r.code, label: r.name }));
}

export default async function OpportunityEditPage({
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
  const [result, productTypeOptions, bizStepOptions, bizOpSourceOptions] = await Promise.all([
    getOpportunity({ id }),
    loadCodeOptions(session.workspaceId, "SALES_PRODUCT_TYPE"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_STEP"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_OP_SOURCE"),
  ]);
  if (!result.ok) {
    redirect("/sales/opportunities?error=not-found");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Opportunities"
        title={result.opportunity.bizOpNm}
        description="영업기회 상세 내용을 수정합니다."
      />
      <OpportunityEditForm
        opportunity={result.opportunity}
        codeOptions={{
          productType: productTypeOptions,
          bizStep: bizStepOptions,
          bizOpSource: bizOpSourceOptions,
        }}
      />
    </div>
  );
}
