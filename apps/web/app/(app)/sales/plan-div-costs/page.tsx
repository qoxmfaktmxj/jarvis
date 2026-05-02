import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listPlanDivCosts } from "../_lib/finance-actions";
import { PlanDivCostsGridContainer } from "./_components/PlanDivCostsGridContainer";

type SearchParams = {
  page?: string;
  q?: string;
  accountType?: string;
  year?: string;
};

export default async function SalesPlanDivCostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const headerStore = await headers();
  const session = await getSession(headerStore.get("x-session-id") ?? "");
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.PlanDivCosts");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const listResult = await listPlanDivCosts({
    page,
    limit,
    q: params.q || undefined,
    accountType: params.accountType || undefined,
    year: params.year || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales / Finance" title={t("title")} description={t("description")} />
      <PlanDivCostsGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          accountType: params.accountType ?? "",
          year: params.year ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
