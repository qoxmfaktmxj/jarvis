import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listFreelancers } from "./actions";
import { FreelancersGridContainer } from "./_components/FreelancersGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  belongYm?: string;
  businessCd?: string;
};

export default async function SalesFreelancersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.Freelancers");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const result = await listFreelancers({
    page,
    limit,
    q: params.q || undefined,
    belongYm: params.belongYm || undefined,
    businessCd: params.businessCd || undefined,
  });

  return (
    <PageShellFit title={t("title")}>
      <FreelancersGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          belongYm: params.belongYm ?? "",
          businessCd: params.businessCd ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
