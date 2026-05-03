/**
 * apps/web/app/(app)/infra/[id]/page.tsx
 *
 * 인프라 시스템 상세 (Plan 5).
 * 자산 정보(11+ 컬럼) 카드 + Runbook (wiki page) embed.
 *
 * 권한: INFRA_READ.
 */
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getInfraSystemById } from "@/lib/queries/infra-system";
import { InfraSystemDetail } from "./_components/InfraSystemDetail";
import { RunbookEmbed } from "./_components/RunbookEmbed";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function InfraSystemDetailPage(props: { params: Params }) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.INFRA_READ)) {
    redirect("/dashboard?error=forbidden");
  }
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
