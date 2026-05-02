import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getActivity } from "../../actions";
import { ActivityEditForm } from "./_components/ActivityEditForm";

export default async function ActivityEditPage({
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
  const result = await getActivity({ id });
  if (!result.ok) {
    redirect("/sales/activities?error=not-found");
  }

  const a = result.activity;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Activities"
        title={a.bizActNm}
        description="영업활동 상세 내용을 수정합니다."
      />
      <ActivityEditForm activity={a} />
    </div>
  );
}
