import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getPlanViewPerformance } from "../../actions";
import { PlanViewPerfDetailView } from "./_components/PlanViewPerfDetailView";

export default async function PlanViewPerformanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const { id } = await params;
  const result = await getPlanViewPerformance({ id });
  if (!result.ok) {
    // ACL deny → forbidden (Option B); missing row → not-found.
    const reason = result.error === "Forbidden" ? "forbidden" : "not-found";
    redirect(`/sales/plan-view-permissions?error=${reason}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Plan View"
        title={result.master.pjtNm ?? result.master.title ?? result.master.pjtCode}
        description="전망/실적 월별 상세 데이터를 조회합니다."
      />
      <PlanViewPerfDetailView
        master={result.master}
        months={result.months}
        canWrite={result.canWrite}
      />
    </div>
  );
}
