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
import { getMarketingByActivity, getMarketingByProduct } from "./actions";
import { MarketingActivityChart } from "./_components/MarketingActivityChart";
import { MarketingProductChart } from "./_components/MarketingProductChart";
import { MarketingFilters } from "./_components/MarketingFilters";

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

type SearchParams = { ym?: string };

export default async function SalesChartsMarketingPage({
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

  const t = await getTranslations("Sales.Charts.Marketing");
  const params = await searchParams;
  const ym = params.ym && /^\d{6}$/.test(params.ym) ? params.ym : defaultYm();

  const [activityRes, productRes, actTypeMap, productTypeMap] = await Promise.all([
    getMarketingByActivity({ ym }),
    getMarketingByProduct({ ym }),
    loadCodeMap(session.workspaceId, "SALES_ACT_TYPE"),
    loadCodeMap(session.workspaceId, "SALES_PRODUCT_TYPE"),
  ]);

  const activityRows = activityRes.ok
    ? activityRes.rows.map((r) => ({
        activityTypeName:
          r.activityTypeCode != null
            ? (actTypeMap.get(r.activityTypeCode) ?? r.activityTypeCode)
            : "(미설정)",
        count: r.count,
      }))
    : [];

  const productRows = productRes.ok
    ? productRes.rows.map((r) => ({
        productTypeName:
          r.productTypeCode != null
            ? (productTypeMap.get(r.productTypeCode) ?? r.productTypeCode)
            : "(미설정)",
        totalAmt: r.totalAmt,
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Charts" title={t("title")} description={t("description")} />
      <MarketingFilters defaultYm={ym} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketingActivityChart data={activityRows} />
        <MarketingProductChart data={productRows} />
      </div>
    </div>
  );
}
