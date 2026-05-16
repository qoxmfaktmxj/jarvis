import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listPlanPerfUpload } from "./actions";
import { PlanPerfUploadGridContainer } from "./_components/PlanPerfUploadGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  ym?: string;
  orgCd?: string;
  gubunCd?: string;
  trendGbCd?: string;
};

export default async function SalesPlanPerfUploadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.Charts.PlanPerfUpload");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const result = await listPlanPerfUpload({
    page,
    limit,
    q: params.q || undefined,
    ym: params.ym || undefined,
    orgCd: params.orgCd || undefined,
    gubunCd: params.gubunCd || undefined,
    trendGbCd: params.trendGbCd || undefined,
  });

  return (
    <div className="space-y-3">
      <PageHeader title={t("title")} />
      <PlanPerfUploadGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          ym: params.ym ?? "",
          orgCd: params.orgCd ?? "",
          gubunCd: params.gubunCd ?? "",
          trendGbCd: params.trendGbCd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
