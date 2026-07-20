import { getTranslations } from "next-intl/server";
import { FIXED_MENU_PERMISSION_CODES, PUBLIC_ROUTE_ALLOWLIST, PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listMenus } from "@/lib/server/repositories/menus";
import { MenusGridContainer } from "./_components/MenusGridContainer";

export default async function MenusPage() {
  const session = await requirePagePermission(PERMISSIONS.MENU_ADMIN, "/admin/menus");
  const t = await getTranslations("Admin.Menus");
  const initial = await listMenus({ workspaceId: session.workspaceId }, { page: 1, limit: 300 });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <MenusGridContainer initialRows={initial.rows} total={initial.total} routeOptions={PUBLIC_ROUTE_ALLOWLIST} permissionOptions={FIXED_MENU_PERMISSION_CODES} />
    </PageShell>
  );
}
