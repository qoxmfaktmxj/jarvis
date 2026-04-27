import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";
import { listLeaveSummary } from "@/lib/queries/contractors";
import { LeaveManagementPanel } from "@/components/contractors/LeaveManagementPanel";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "휴가관리" };
export const dynamic = "force-dynamic";

export default async function ContractorsLeavesPage({
  searchParams
}: PageProps) {
  const session = await requirePageSession(
    PERMISSIONS.CONTRACTOR_READ,
    "/dashboard"
  );

  const sp = await searchParams;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const referenceDate =
    typeof sp?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : todayStr;
  const nameLike = typeof sp?.name === "string" ? sp.name : "";

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const rows = await listLeaveSummary({
    workspaceId: session.workspaceId,
    referenceDate,
    nameLike: nameLike || undefined,
    currentUserId: isAdmin ? undefined : session.userId
  });

  return (
    <LeaveManagementPanel
      initialSummary={rows}
      initialQuery={{ referenceDate, name: nameLike }}
      isAdmin={isAdmin}
    />
  );
}
