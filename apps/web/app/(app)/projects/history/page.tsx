import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listProjectHistory } from "./actions";
import { HistoryGridContainer } from "./_components/HistoryGridContainer";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Projects.History");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;

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
      <PageHeader kicker="Projects" title={t("title")} subtitle={t("description")} />
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
