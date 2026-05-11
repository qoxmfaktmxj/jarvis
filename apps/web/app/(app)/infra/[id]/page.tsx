/**
 * apps/web/app/(app)/infra/[id]/page.tsx
 *
 * 인프라 시스템 상세 (Plan 5).
 * 자산 정보(11+ 컬럼) 카드 + Runbook (wiki page) embed.
 *
 * 권한: INFRA_READ.
 *
 * B-P0-02 fix: 위키 페이지 deep link는 `wiki_page_index`의
 * (publishedStatus, requiredPermission, sensitivity)로 page-load 시 ACL 게이팅.
 * 미허가 사용자에게는 title/routeKey 자체를 노출하지 않는다 (정보 누설 방지).
 */
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { canViewWikiPage } from "@jarvis/auth";
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

  // B-P0-02: only expose the wiki page link if the caller can actually view
  // the page. The join in getInfraSystemById is sensitivity-blind, so we gate
  // here against (publishedStatus, requiredPermission, sensitivity). If the
  // ACL denies access we pass null fields to RunbookEmbed — it renders the
  // "no runbook" CTA instead of leaking title / routeKey.
  const wikiLinkAllowed =
    row.wikiPageId !== null &&
    row.wikiPageSensitivity !== null &&
    row.wikiPagePublishedStatus !== null &&
    canViewWikiPage(
      {
        sensitivity: row.wikiPageSensitivity,
        requiredPermission: row.wikiPageRequiredPermission,
        publishedStatus: row.wikiPagePublishedStatus,
      },
      session.permissions,
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infra"
        title={t("Detail.title", { systemName: row.systemName })}
        description={row.companyName ?? ""}
      />
      <InfraSystemDetail row={row} />
      <RunbookEmbed
        wikiPageId={wikiLinkAllowed ? row.wikiPageId : null}
        wikiPageRouteKey={wikiLinkAllowed ? row.wikiPageRouteKey : null}
        wikiPageTitle={wikiLinkAllowed ? row.wikiPageTitle : null}
      />
    </div>
  );
}
