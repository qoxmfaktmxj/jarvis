/**
 * apps/web/app/(app)/admin/infra/licenses/page.tsx
 *
 * 인프라 라이선스 관리 (TBIZ500). 회사 × 환경(개발/스테이징/운영) 단위로
 * 22 모듈 라이선스 활성 여부를 보관·편집한다.
 *
 * 권한: ADMIN_ALL (Phase-Sales P1.5에선 SYSTEM_* 권한이 미정의이므로
 * 기존 admin 라우트 컨벤션을 따른다. SYSTEM_* 분리는 Task 10 또는 후속.)
 *
 * 메뉴 노출 (menu_item) 은 Task 10에서 시드한다. 현재는 직접 URL로만 접근 가능.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listCompanyOptions } from "@/lib/queries/infra-license";
import { listInfraLicenses } from "./actions";
import { InfraLicensesGrid } from "./_components/InfraLicensesGrid";

/** Task 10이 INFRA_DEV_GB code_group을 seed하기 전까지 사용할 fallback. */
const DEV_GB_FALLBACK = [
  { value: "01", label: "개발" },
  { value: "02", label: "스테이징" },
  { value: "03", label: "운영" },
];

async function loadDevGbOptions(workspaceId: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, "INFRA_DEV_GB")))
    .orderBy(codeItem.code);
  return rows.length > 0
    ? rows.map((r) => ({ value: r.code, label: r.name }))
    : DEV_GB_FALLBACK;
}

export default async function AdminInfraLicensesPage() {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const limit = 50;
  const [listResult, companyOptions, devGbOptions] = await Promise.all([
    listInfraLicenses({ page: 1, limit }),
    listCompanyOptions(session.workspaceId),
    loadDevGbOptions(session.workspaceId),
  ]);

  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Infra · Licenses"
        title="인프라 라이선스"
        description="회사 × 환경(개발/스테이징/운영) 단위로 22 모듈 라이선스 활성 여부를 관리합니다."
      />
      <InfraLicensesGrid
        initialRows={initialRows}
        initialTotal={initialTotal}
        page={1}
        limit={limit}
        companyOptions={companyOptions}
        devGbOptions={devGbOptions}
      />
    </div>
  );
}
