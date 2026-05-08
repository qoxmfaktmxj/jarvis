/**
 * apps/web/app/(app)/infra/[id]/page.tsx
 *
 * 인프라 시스템 상세 (Plan 5).
 * 자산 정보(11+ 컬럼) 카드 + Runbook (wiki page) embed.
 *
 * 권한: INFRA_READ.
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
        eyebrow="Infra"
        title={t("Detail.title", { systemName: row.systemName })}
        description={row.companyName ?? ""}
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
