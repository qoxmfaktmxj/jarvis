import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PlanViewPermissionsGridContainer } from "./_components/PlanViewPermissionsGridContainer";
import { listPlanViewPermissions } from "./actions";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  companyCd?: string;
};

export default async function SalesPlanViewPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const filters = {
    q: params.q ?? "",
    contYear: params.contYear ?? "",
    companyCd: params.companyCd ?? "",
    page: String(page),
  };
  const result = await listPlanViewPermissions({
    q: filters.q || undefined,
    contYear: filters.contYear || undefined,
    companyCd: filters.companyCd || undefined,
    page,
    limit,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Plan View Permissions"
        title="계획/전망/실적 권한 관리"
        description="계획/전망/실적 행과 사용자별 행 권한을 관리합니다."
      />
      <PlanViewPermissionsGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={filters}
      />
    </div>
  );
}
