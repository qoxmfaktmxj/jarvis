"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  contractorContract,
  leaveRequest,
  auditLog
} from "@jarvis/db/schema";
import { requirePageSession } from "@/lib/server/page-auth";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  leaveBatchInputSchema,
  validateBatchBusinessRules
} from "./actions.validators.js";

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

export async function saveLeaveBatch(
  input: unknown
): Promise<{ inserted: string[]; cancelled: string[]; cancelFailed: string[] }> {
  const parsed = leaveBatchInputSchema.parse(input);
  validateBatchBusinessRules(parsed);

  // requirePageSession with permission check: redirects if unauthorized
  const session = await requirePageSession(PERMISSIONS.CONTRACTOR_ADMIN);

  // Additional runtime guard (requirePageSession may redirect instead of throw)
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN)) {
    throw new Error("forbidden");
  }

  const contract = await db
    .select({
      id: contractorContract.id,
      workspaceId: contractorContract.workspaceId,
      userId: contractorContract.userId
    })
    .from(contractorContract)
    .where(eq(contractorContract.id, parsed.contractId))
    .limit(1);

  if (contract.length === 0) throw new Error("contract-not-found");
  if (contract[0]!.workspaceId !== session.workspaceId) throw new Error("forbidden");

  const inserted: string[] = [];
  const cancelled: string[] = [];
  const cancelFailed: string[] = [];

  await db.transaction(async (tx) => {
    for (const ins of parsed.inserts) {
      const id = randomUUID();
      await tx.insert(leaveRequest).values({
        id,
        workspaceId: session.workspaceId,
        userId: contract[0]!.userId,
        contractId: parsed.contractId,
        type: ins.type,
        startDate: ins.startDate,
        endDate: ins.endDate,
        hours: String(ins.hours),
        reason: ins.reason ?? null,
        status: "approved",
        createdBy: session.userId
      });
      await tx.insert(auditLog).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "LEAVE_INSERT",
        resourceType: "leave_request",
        resourceId: id,
        details: { contractId: parsed.contractId, type: ins.type }
      });
      inserted.push(id);
    }

    if (parsed.cancels.length > 0) {
      // Bind to parsed.contractId so a caller cannot cancel another contractor's leave.
      const updated = await tx
        .update(leaveRequest)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            inArray(leaveRequest.id, parsed.cancels),
            eq(leaveRequest.workspaceId, session.workspaceId),
            eq(leaveRequest.contractId, parsed.contractId),
            eq(leaveRequest.status, "approved")
          )
        )
        .returning({ id: leaveRequest.id });

      const updatedIds = new Set(updated.map((r) => r.id));

      for (const id of parsed.cancels) {
        if (!updatedIds.has(id)) {
          cancelFailed.push(id);
          console.warn(`LEAVE_CANCEL: id ${id} not updated (wrong contract, status, or workspace)`);
          continue;
        }
        await tx.insert(auditLog).values({
          id: randomUUID(),
          workspaceId: session.workspaceId,
          userId: session.userId,
          action: "LEAVE_CANCEL",
          resourceType: "leave_request",
          resourceId: id,
          details: { contractId: parsed.contractId }
        });
        cancelled.push(id);
      }
    }
  });

  return { inserted, cancelled, cancelFailed };
}
