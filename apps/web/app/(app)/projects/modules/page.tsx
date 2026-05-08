import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listProjectModules } from "./actions";
import { ModulesGridContainer } from "./_components/ModulesGridContainer";

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
  const limit = 50;

  const listResult = await listProjectModules({
    page,
    limit,
    q: params.q || undefined,
    pjtCd: params.pjtCd || undefined,
    sabun: params.sabun || undefined,
    moduleCd: params.moduleCd || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Projects" title={t("title")} subtitle={t("description")} />
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
