/**
 * apps/web/app/(app)/infra/[id]/page.tsx
 *
 * 인프라 시스템 상세 (Plan 5).
 * 자산 정보(11+ 컬럼) 카드 + Runbook (wiki page) embed.
 *
 * 권한: INFRA_READ.
 *
 * Step 2E (sensitivity 제거): A8 B-P0-02 fix의 `canViewWikiPage` 게이팅은 폐지됐다.
 * `INFRA_READ` 가드를 통과하면 link된 wiki 페이지의 title/routeKey를 그대로 노출한다.
 * (canViewWikiPage helper는 Step 1에서 stub으로 전환됐고, Step 3에서 함수 자체 제거.)
 */
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { getInfraSystemById } from "@/lib/queries/infra-system";
import { InfraSystemDetail } from "./_components/InfraSystemDetail";
import { RunbookEmbed } from "./_components/RunbookEmbed";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function InfraSystemDetailPage(props: { params: Params }) {
  const session = await requirePageSession(PERMISSIONS.INFRA_READ, "/dashboard?error=forbidden");
  const { id } = await props.params;
  const row = await getInfraSystemById(session.workspaceId, id);
  if (!row) notFound();

  const t = await getTranslations("Infra");

  return (
    <div className="space-y-6">
      <PageHeader
               title={t("Detail.title", { systemName: row.systemName })}
             />
      <InfraSystemDetail row={row} />
      <RunbookEmbed
        wikiPageId={row.wikiPageId}
        wikiPageRouteKey={row.wikiPageRouteKey}
        wikiPageTitle={row.wikiPageTitle}
      />
    </div>
  );
}
