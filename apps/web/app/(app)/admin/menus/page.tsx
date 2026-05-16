/**
 * apps/web/app/(app)/admin/menus/page.tsx
 *
 * /admin/menus RSC. 권한 게이트(ADMIN_ALL) 후 마스터/디테일 그리드 초기 데이터를
 * server action으로 미리 적재하여 MenusPageClient에 props로 주입.
 *
 * 마스터(menu_item) flat list + 디테일(menu_permission)은 admin/codes 패턴을
 * 따르며, MenuTreeViewer(read-only)는 본 화면에서 제거되었다.
 */
import { getTranslations } from "next-intl/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { menuItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ICON_MAP } from "@/components/layout/icon-map";
import { listMenus } from "./actions";
import { MenusPageClient } from "./_components/MenusPageClient";

export default async function AdminMenusPage() {
  // Defense-in-depth: admin/layout.tsx redirects non-admins, but we re-check
  // here so a future refactor doesn't silently lose the gate. Match the
  // layout's redirect target — sending an authenticated non-admin to /login
  // causes a confusing reauth loop.
  const session = await requirePageSession(PERMISSIONS.ADMIN_ALL, "/dashboard?error=forbidden");

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
    // viewport-fit: AppShellMain의 py-8(4rem) + 전역 topbar 높이를 뺀 나머지를
    // 페이지 컨테이너에 강제. PageHeader는 자연 높이, MenusPageClient의 grid div가
    // flex-1로 남은 공간을 차지해 페이지 자체 스크롤이 발생하지 않게 한다.
    // (dashboard/page.tsx 동일 패턴 — 데이터 dense admin 화면의 표준 처리.)
    <div
      className="flex flex-col gap-6"
      style={{ height: "calc(100vh - var(--topbar-height) - 4rem)" }}
    >
      <PageHeader title={t("title")} />
      <MenusPageClient
        initialMenus={initialMenus}
        initialMenuTotal={initialMenuTotal}
        parentOptions={parentOptions}
        iconOptions={iconOptions}
      />
    </div>
  );
}
