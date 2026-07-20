import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listUsers } from "@/lib/server/repositories/users";
import { UsersGridContainer } from "./_components/UsersGridContainer";

export default async function UsersPage() {
  const session = await requirePagePermission(PERMISSIONS.USER_ADMIN, "/admin/users");
  const t = await getTranslations("Admin.Users");
  const initial = await listUsers({ workspaceId: session.workspaceId }, { page: 1, limit: 50, accountType: "human" });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <UsersGridContainer
        initialRows={initial.rows.filter((row) => row.accountType === "human")}
        total={initial.total}
        currentUserId={session.userId}
      />
    </PageShell>
  );
}
