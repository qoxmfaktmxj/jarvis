"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  contractorContract,
  leaveRequest,
  auditLog
} from "@jarvis/db/schema";
import { requirePageSession } from "@/lib/server/page-auth";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const LEAVE_TYPES = ["annual", "halfAm", "halfPm", "sick", "family"] as const;

const insertSchema = z.object({
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive(),
  reason: z.string().max(500).optional().nullable()
});

export const leaveBatchInputSchema = z.object({
  contractId: z.string().uuid(),
  inserts: z.array(insertSchema),
  cancels: z.array(z.string().uuid())
});

export type LeaveBatchInput = z.infer<typeof leaveBatchInputSchema>;

// ---------------------------------------------------------------------------
// Pure business rule validator (exported for tests)
// ---------------------------------------------------------------------------

export function validateBatchBusinessRules(input: LeaveBatchInput): void {
  for (const ins of input.inserts) {
    if (ins.startDate > ins.endDate) throw new Error("invalid-range");
    if (ins.hours <= 0) throw new Error("invalid-hours");
  }
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

export async function saveLeaveBatch(
  input: unknown
): Promise<{ inserted: string[]; cancelled: string[] }> {
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
      await tx
        .update(leaveRequest)
        .set({ cancelledAt: new Date() })
        .where(inArray(leaveRequest.id, parsed.cancels));

      for (const id of parsed.cancels) {
        await tx.insert(auditLog).values({
          id: randomUUID(),
          workspaceId: session.workspaceId,
          userId: session.userId,
          action: "LEAVE_CANCEL",
          resourceType: "leave_request",
          resourceId: id,
          details: {}
        });
        cancelled.push(id);
      }
    }
  });

  return { inserted, cancelled };
}
