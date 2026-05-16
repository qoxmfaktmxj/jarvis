/**
 * apps/web/app/(app)/admin/roles/page.tsx
 *
 * /admin/roles RSC. 권한 게이트(ADMIN_ALL) 후 마스터/디테일 그리드 초기 데이터를
 * server action으로 미리 적재하여 RolesPageClient에 props로 주입.
 *
 * 마스터(role) + 디테일(role_permission) — admin/menus 패턴 동일 구조.
 */
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listRoles } from "./actions";
import { RolesPageClient } from "./_components/RolesPageClient";

export default async function AdminRolesPage() {
  // Defense-in-depth: admin/layout.tsx redirects non-admins, but we re-check
  // here so a future refactor doesn't silently lose the gate.
  await requirePageSession(PERMISSIONS.ADMIN_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Admin.Roles");

  const initial = await listRoles({ page: 1, limit: 100 });

  const initialRoles =
    "rows" in initial && Array.isArray(initial.rows) ? initial.rows : [];
  const initialRolesTotal =
    "total" in initial && typeof initial.total === "number" ? initial.total : 0;

  return (
    <PageShellFit title={t("title")}>
      <RolesPageClient
        initialRoles={initialRoles}
        initialRolesTotal={initialRolesTotal}
      />
    </PageShellFit>
  );
}
