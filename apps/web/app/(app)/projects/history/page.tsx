import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listProjectHistory } from "./actions";
import { HistoryGridContainer } from "./_components/HistoryGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  pjtCd?: string;
  sabun?: string;
  orgCd?: string;
  roleCd?: string;
  statusCd?: string;
  baseSymd?: string;
  baseEymd?: string;
};

export default async function ProjectHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/dashboard?error=forbidden");

  const t = await getTranslations("Projects.History");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listProjectHistory({
    page,
    limit,
    q: params.q || undefined,
    pjtCd: params.pjtCd || undefined,
    sabun: params.sabun || undefined,
    orgCd: params.orgCd || undefined,
    roleCd: params.roleCd || undefined,
    statusCd: params.statusCd || undefined,
    baseSymd: params.baseSymd || undefined,
    baseEymd: params.baseEymd || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")}/>
      <HistoryGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          pjtCd: params.pjtCd ?? "",
          sabun: params.sabun ?? "",
          orgCd: params.orgCd ?? "",
          roleCd: params.roleCd ?? "",
          statusCd: params.statusCd ?? "",
          baseSymd: params.baseSymd ?? "",
          baseEymd: params.baseEymd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
