/**
 * apps/web/app/(app)/admin/codes/page.tsx
 *
 * /admin/codes RSC. 권한 게이트 후 초기 마스터 그리드 데이터를 server action으로
 * 미리 적재하여 CodesPageClient에 props로 주입.
 *
 * 권한: ADMIN_ALL.
 *
 * Phase 진행 메모:
 *  - Dispatch B (현재): 새 grid UI를 마운트. 레거시 CodeTable.tsx와 REST 라우트는
 *    그대로 두고 화면 진입점만 교체.
 *  - Dispatch C: legacy CodeTable + /api/admin/codes 정리, ko.json i18n 키 추가.
 */
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { getCodesByGroup } from "@/lib/queries/admin";
import { requirePageSession } from "@/lib/server/page-auth";
import { listCodeGroups } from "./actions";
import { CodesPageClient } from "./_components/CodesPageClient";

export default async function AdminCodesPage() {
  const session = await requirePageSession(PERMISSIONS.ADMIN_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Admin.Codes");

  const [initial, businessDivOptions] = await Promise.all([
    listCodeGroups({ page: 1, limit: 100 }),
    getCodesByGroup(session.workspaceId, "BIZ_DIVISION"),
  ]);
  const initialGroups =
    "rows" in initial && Array.isArray(initial.rows) ? initial.rows : [];
  const initialGroupTotal =
    "total" in initial && typeof initial.total === "number" ? initial.total : 0;

  return (
    <PageShellFit title={t("title")}>
      <CodesPageClient
        initialGroups={initialGroups}
        initialGroupTotal={initialGroupTotal}
        businessDivOptions={businessDivOptions}
      />
    </PageShellFit>
  );
}
