import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listPlanDivCosts } from "../_lib/finance-actions";
import { PlanDivCostsGridContainer } from "./_components/PlanDivCostsGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

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
  await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.PlanDivCosts");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const listResult = await listPlanDivCosts({
    page,
    limit,
    q: params.q || undefined,
    accountType: params.accountType || undefined,
    year: params.year || undefined,
  });

  return (
    <PageShellFit title={t("title")}>
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
    </PageShellFit>
  );
}
