import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { DashboardAskLauncher } from "@/components/dashboard/DashboardAskLauncher";
import { DashboardRecentConversations } from "@/components/dashboard/DashboardRecentConversations";
import { DashboardRecentEvidence } from "@/components/dashboard/DashboardRecentEvidence";
import { listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listRecentWikiPages } from "@/lib/server/wiki-page-loader";

export default async function DashboardPage() {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/dashboard");
  const t = await getTranslations("Dashboard.Home");
  const [conversations, evidence] = await Promise.all([
    listOwnedConversations({
      workspaceId: session.workspaceId,
      userId: session.userId,
      limit: 5,
    }),
    listRecentWikiPages({ workspaceId: session.workspaceId, limit: 5 }),
  ]);
  return (
    <PageShell className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DashboardAskLauncher />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardRecentConversations
          rows={conversations}
          title={t("recentConversationsTitle")}
          emptyLabel={t("recentConversationsEmpty")}
        />
        <DashboardRecentEvidence
          rows={evidence.map((row) => ({
            ...row,
            typeLabel: t(`evidenceTypes.${row.pageType}`),
          }))}
          title={t("recentEvidenceTitle")}
          emptyLabel={t("recentEvidenceEmpty")}
        />
      </div>
    </PageShell>
  );
}
