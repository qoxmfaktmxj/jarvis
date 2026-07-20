import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listCodeGroups, listCodeItems } from "@/lib/server/repositories/codes";
import { CodesGridContainer } from "./_components/CodesGridContainer";

export default async function CodesPage() {
  const session = await requirePagePermission(PERMISSIONS.CODE_ADMIN, "/admin/codes");
  const t = await getTranslations("Admin.Codes");
  const groups = await listCodeGroups({ workspaceId: session.workspaceId }, { page: 1, limit: 100 });
  const itemsByGroupId = Object.fromEntries(
    await Promise.all(
      groups.rows.map(async (group) => {
        const items = await listCodeItems({ workspaceId: session.workspaceId }, { groupId: group.id, page: 1, limit: 200 });
        return [group.id, items.rows];
      }),
    ),
  );
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <CodesGridContainer initialGroups={groups.rows} initialItemsByGroupId={itemsByGroupId} />
    </PageShell>
  );
}
