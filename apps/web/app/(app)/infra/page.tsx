/**
 * apps/web/app/(app)/infra/page.tsx
 *
 * 인프라구성관리 — Grid SoT (Plan 5).
 * 회사 × 시스템 × 환경 단위로 자산 정보(접속·DB·OS·배포·담당자)를 관리하고,
 * 자유 텍스트 운영 절차(Runbook)는 wiki/jarvis/auto/infra/**.md 페이지로 link.
 *
 * 권한: INFRA_READ.
 * 메뉴: 사내 zip 채널 menu seed에서 `/infra/runbooks` 이동 + 새 `/infra` Grid 항목 추가.
 *
 * 기존 wiki dashboard 코드는 `/infra/runbooks/page.tsx`로 이동되었다.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listInfraSystems } from "@/lib/queries/infra-system";
import { listCompanyOptions } from "@/lib/queries/infra-license";
import { InfraSystemsGridContainer } from "./_components/InfraSystemsGridContainer";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function InfraPage(props: {
  searchParams?: SearchParams;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.INFRA_READ)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Infra");
  const sp = props.searchParams ? await props.searchParams : {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const companyId = typeof sp.companyId === "string" ? sp.companyId : "";
  const envType = typeof sp.envType === "string" ? sp.envType : "";
  const dbType = typeof sp.dbType === "string" ? sp.dbType : "";
  const page =
    typeof sp.page === "string" ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const limit = 50;

  const [listResult, companyOptions] = await Promise.all([
    listInfraSystems(session.workspaceId, {
      page,
      limit,
      q: q || undefined,
      companyId: companyId || undefined,
      envType: envType || undefined,
      dbType: dbType || undefined,
    }),
    listCompanyOptions(session.workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infra"
        title={t("title")}
        description={t("description")}
      />
      <InfraSystemsGridContainer
        initialRows={listResult.rows}
        initialTotal={listResult.total}
        page={page}
        limit={limit}
        companyOptions={companyOptions}
        initialQ={q}
        initialCompanyId={companyId}
        initialEnvType={envType}
        initialDbType={dbType}
      />
    </div>
  );
}
