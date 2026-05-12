import { redirect } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { getPlanViewPerformance } from "../../actions";
import { PlanViewPerfDetailView } from "./_components/PlanViewPerfDetailView";

export default async function PlanViewPerformanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

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
               title={result.master.pjtNm ?? result.master.title ?? result.master.pjtCode}
             />
      <PlanViewPerfDetailView
        master={result.master}
        months={result.months}
        canWrite={result.canWrite}
      />
    </div>
  );
}
