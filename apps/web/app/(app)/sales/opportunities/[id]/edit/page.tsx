import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getOpportunity } from "../../actions";
import { OpportunityEditForm } from "./_components/OpportunityEditForm";

export default async function OpportunityEditPage({
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
  const result = await getOpportunity({ id });
  if (!result.ok) {
    redirect("/sales/opportunities?error=not-found");
  }
  const o = result.opportunity;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Opportunities"
        title={o.bizOpNm}
        description="영업기회 상세 내용을 수정합니다."
      />
      <OpportunityEditForm opportunity={o} />
    </div>
  );
}
