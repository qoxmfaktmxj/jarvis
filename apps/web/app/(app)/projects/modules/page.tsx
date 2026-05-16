import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listProjectModules } from "./actions";
import { ModulesGridContainer } from "./_components/ModulesGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  pjtCd?: string;
  sabun?: string;
  moduleCd?: string;
};

export default async function ProjectModulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/dashboard?error=forbidden");

  const t = await getTranslations("Projects.Modules");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listProjectModules({
    page,
    limit,
    q: params.q || undefined,
    pjtCd: params.pjtCd || undefined,
    sabun: params.sabun || undefined,
    moduleCd: params.moduleCd || undefined,
  });

  return (
    <div className="space-y-3">
      <PageHeader title={t("title")} />
      <ModulesGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          pjtCd: params.pjtCd ?? "",
          sabun: params.sabun ?? "",
          moduleCd: params.moduleCd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
