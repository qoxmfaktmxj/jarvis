import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { OpportunitiesGridContainer } from "./_components/OpportunitiesGridContainer";
import { listOpportunities } from "./actions";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export default async function SalesOpportunitiesPage({
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
    bizStepCode: sp.bizStepCode,
    productTypeCode: sp.productTypeCode,
    focusOnly: sp.focusOnly,
  };
  const focusOnlyApi =
    sp.focusOnly === "Y" ? true : sp.focusOnly === "N" ? false : undefined;

  const [listResult, productTypeOptions, bizStepOptions, bizOpSourceOptions] = await Promise.all([
    listOpportunities({ page, limit, q: filters.q, bizStepCode: filters.bizStepCode, productTypeCode: filters.productTypeCode, focusOnly: focusOnlyApi }),
    loadCodeOptions(session.workspaceId, "SALES_PRODUCT_TYPE"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_STEP"),
    loadCodeOptions(session.workspaceId, "SALES_BIZ_OP_SOURCE"),
  ]);

  const initialRows = "ok" in listResult && listResult.ok ? listResult.rows : [];
  const initialTotal = "ok" in listResult && listResult.ok ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Opportunities"
        title="영업기회"
        description="영업기회(BizOp) 마스터를 관리합니다."
      />
      <OpportunitiesGridContainer
        initial={initialRows}
        total={initialTotal}
        page={page}
        limit={limit}
        initialFilters={filters}
        codeOptions={{
          productType: productTypeOptions,
          bizStep: bizStepOptions,
          bizOpSource: bizOpSourceOptions,
        }}
      />
    </div>
  );
}
