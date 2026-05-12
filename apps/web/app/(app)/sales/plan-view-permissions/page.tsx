import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { PlanViewPermissionsGridContainer } from "./_components/PlanViewPermissionsGridContainer";
import { listPlanViewPermissions } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  companyCd?: string;
};

export default async function SalesPlanViewPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.PlanViewPermissions");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const filters = {
    q: params.q ?? "",
    contYear: params.contYear ?? "",
    companyCd: params.companyCd ?? "",
    page: String(page),
  };
  const result = await listPlanViewPermissions({
    q: filters.q || undefined,
    contYear: filters.contYear || undefined,
    companyCd: filters.companyCd || undefined,
    page,
    limit,
  });

  return (
    <div className="space-y-6">
      <PageHeader
               title={t("title")}
             />
      <PlanViewPermissionsGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={filters}
      />
    </div>
  );
}
