"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listAuditLogs } from "@/lib/server/repositories/audit";
import { PERMISSIONS } from "@jarvis/shared";

export async function listAuditLogsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.AUDIT_READ);
  return listAuditLogs({ workspaceId: session.workspaceId }, raw);
}
