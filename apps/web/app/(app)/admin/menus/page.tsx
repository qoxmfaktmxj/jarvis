/**
 * apps/web/app/(app)/admin/menus/page.tsx
 *
 * /admin/menus RSC. 권한 게이트(ADMIN_ALL) 후 마스터/디테일 그리드 초기 데이터를
 * server action으로 미리 적재하여 MenusPageClient에 props로 주입.
 *
 * 마스터(menu_item) flat list + 디테일(menu_permission)은 admin/codes 패턴을
 * 따르며, MenuTreeViewer(read-only)는 본 화면에서 제거되었다.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { asc, eq } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { menuItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ICON_MAP } from "@/components/layout/icon-map";
import { listMenus } from "./actions";
import { MenusPageClient } from "./_components/MenusPageClient";

export default async function AdminMenusPage() {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  // Defense-in-depth: admin/layout.tsx redirects non-admins, but we re-check
  // here so a future refactor doesn't silently lose the gate. Match the
  // layout's redirect target — sending an authenticated non-admin to /login
  // causes a confusing reauth loop.
  if (!session || !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Admin.Menus");

  const [initial, parentRows] = await Promise.all([
    listMenus({ page: 1, limit: 200 }),
    // Parent select options = every menu_item code in this workspace, sorted by code.
    // (parentCode + label, "kind" omitted; admins choose by mnemonic code.)
    db
      .select({
        code: menuItem.code,
        label: menuItem.label,
      })
      .from(menuItem)
      .where(eq(menuItem.workspaceId, session.workspaceId))
      .orderBy(asc(menuItem.code)),
  ]);

  const initialMenus =
    "rows" in initial && Array.isArray(initial.rows) ? initial.rows : [];
  const initialMenuTotal =
    "total" in initial && typeof initial.total === "number" ? initial.total : 0;

  const parentOptions = parentRows.map((r) => ({
    code: r.code,
    label: `${r.code} · ${r.label}`,
  }));

  // Icon options come from `apps/web/components/layout/icon-map.ts` keys.
  // Icon name == lucide component name; admins pick the string that the seed
  // / runtime resolves through ICON_MAP.
  const iconOptions = Object.keys(ICON_MAP)
    .sort()
    .map((name) => ({ value: name, label: name }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Menus"
        title={t("title")}
        description={t("description")}
      />
      <MenusPageClient
        initialMenus={initialMenus}
        initialMenuTotal={initialMenuTotal}
        parentOptions={parentOptions}
        iconOptions={iconOptions}
      />
    </div>
  );
}
