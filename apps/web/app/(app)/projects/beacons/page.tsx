import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listProjectBeacons } from "./actions";
import { BeaconsGridContainer } from "./_components/BeaconsGridContainer";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Projects.Beacons");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;

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
      <PageHeader kicker="Projects" title={t("title")} subtitle={t("description")} />
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
