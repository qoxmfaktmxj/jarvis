import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listProjectBeacons } from "./actions";
import { BeaconsGridContainer } from "./_components/BeaconsGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  pjtCd?: string;
  sabun?: string;
  outYn?: string;
};

export default async function ProjectBeaconsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/dashboard?error=forbidden");

  const t = await getTranslations("Projects.Beacons");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listProjectBeacons({
    page,
    limit,
    q: params.q || undefined,
    pjtCd: params.pjtCd || undefined,
    sabun: params.sabun || undefined,
    outYn: params.outYn || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <BeaconsGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          pjtCd: params.pjtCd ?? "",
          sabun: params.sabun ?? "",
          outYn: params.outYn ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
