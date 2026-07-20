import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listWikiReviews } from "@/lib/server/repositories/wiki-reviews";
import { WikiReviewsGridContainer } from "./_components/WikiReviewsGridContainer";

export default async function WikiReviewsPage() {
  const session = await requirePagePermission(PERMISSIONS.REVIEW_MANAGE, "/admin/wiki-reviews");
  const t = await getTranslations("Admin.WikiReviews");
  const initial = await listWikiReviews({ workspaceId: session.workspaceId }, { page: 1, limit: 50 });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <WikiReviewsGridContainer initialRows={initial.rows} total={initial.total} />
    </PageShell>
  );
}
