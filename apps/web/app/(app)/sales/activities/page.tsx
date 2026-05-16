import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem, salesOpportunity } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { isAdmin } from "@jarvis/auth";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { ActivitiesGridContainer } from "./_components/ActivitiesGridContainer";
import { listActivities } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

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
  const session = await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const limit = DEFAULT_PAGE_SIZE;
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
    <PageShellFit title="영업활동">
      <ActivitiesGridContainer
        initial={initialRows}
        total={initialTotal}
        page={page}
        limit={limit}
        initialFilters={filters}
        isAdmin={isAdmin(session)}
        codeOptions={{
          actType: actTypeOptions,
          accessRoute: accessRouteOptions,
          bizStep: bizStepOptions,
          productType: productTypeOptions,
        }}
        opportunityOptions={opportunityOptions}
      />
    </PageShellFit>
  );
}
