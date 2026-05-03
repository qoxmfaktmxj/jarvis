import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listMaintenanceAction } from "./actions";
import { MaintenanceTabsClient } from "./_components/MaintenanceTabsClient";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export default async function MaintenanceAssignmentsPage() {
  const t = await getTranslations("Maintenance.Assignments");
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (
    !session ||
    !(
      hasPermission(session, PERMISSIONS.MAINTENANCE_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL)
    )
  ) {
    redirect("/dashboard?error=forbidden");
  }

  const canWrite =
    hasPermission(session, PERMISSIONS.MAINTENANCE_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);
  const canAdmin =
    hasPermission(session, PERMISSIONS.MAINTENANCE_ADMIN) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const [initialResult, contractTypeOptions] = await Promise.all([
    listMaintenanceAction({ page: 1, limit: 50 }),
    loadCodeOptions(session.workspaceId, "C10020"),
  ]);

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · Maintenance"
        title={t("title")}
        description={t("subtitle")}
      />
      <MaintenanceTabsClient
        initialRows={initialRows}
        initialTotal={initialTotal}
        contractTypeOptions={contractTypeOptions}
        canWrite={canWrite}
        canAdmin={canAdmin}
      />
    </div>
  );
}
