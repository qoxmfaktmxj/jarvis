import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listSources } from "@/lib/server/repositories/sources";
import { SourcesGridContainer } from "./_components/SourcesGridContainer";

export default async function SourcesPage() {
  const session = await requirePagePermission(PERMISSIONS.SOURCE_INGEST, "/admin/sources");
  const t = await getTranslations("Admin.Sources");
  const initial = await listSources({ workspaceId: session.workspaceId }, { page: 1, limit: 50 });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <SourcesGridContainer initialRows={initial.rows} total={initial.total} />
    </PageShell>
  );
}
