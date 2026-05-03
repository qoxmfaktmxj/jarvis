"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, maintenanceAssignment } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listAssignmentsByUserInput,
  listMaintenanceInput,
  saveMaintenanceInput,
  type MaintenanceAssignmentRow,
  type SaveMaintenanceOutput,
} from "@jarvis/shared/validation/maintenance";
import { and, eq } from "drizzle-orm";
import {
  getMaintenanceAssignment,
  listAssignmentsByUser,
  listMaintenanceAssignments,
  listUsersWithAssignmentCounts,
  type MaintenanceRow,
} from "@/lib/queries/maintenance";

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

async function resolveContext(required: Permission) {
  const sessionId = await resolveSessionId();
  const session = await getSession(sessionId ?? "");
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, required) && !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, session };
}

function toClientRow(r: MaintenanceRow): MaintenanceAssignmentRow {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    companyId: r.companyId,
    companyName: r.companyName,
    startDate: r.startDate,
    endDate: r.endDate,
    contractNumber: r.contractNumber,
    contractType: r.contractType,
    note: r.note,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  };
}

export async function listMaintenanceAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.MAINTENANCE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listMaintenanceInput.parse(rawInput);
  const result = await listMaintenanceAssignments({
    workspaceId: ctx.session.workspaceId,
    q: input.q,
    userId: input.userId,
    companyId: input.companyId,
    contractType: input.contractType,
    activeOn: input.activeOn,
    page: input.page,
    limit: input.limit,
  });

  return {
    ok: true as const,
    rows: result.data.map(toClientRow),
    total: result.pagination.total,
  };
}

export async function listAssignmentsByUserAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.MAINTENANCE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };

  const input = listAssignmentsByUserInput.parse(rawInput);
  const rows = await listAssignmentsByUser({
    workspaceId: ctx.session.workspaceId,
    userId: input.userId,
    activeOn: input.activeOn,
  });
  return { ok: true as const, rows: rows.map(toClientRow) };
}

export async function listUsersWithAssignmentCountsAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.MAINTENANCE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };

  const parsed = (rawInput ?? {}) as { q?: string; activeOn?: string };
  const rows = await listUsersWithAssignmentCounts({
    workspaceId: ctx.session.workspaceId,
    q: parsed.q,
    activeOn: parsed.activeOn,
  });
  return { ok: true as const, rows };
}

export async function saveMaintenanceAction(
  rawInput: unknown,
): Promise<SaveMaintenanceOutput & { error?: string }> {
  const ctx = await resolveContext(PERMISSIONS.MAINTENANCE_WRITE);
  if (!ctx.ok) {
    return { ok: false, inserted: 0, updated: 0, deleted: 0, error: ctx.error };
  }

  let parsed;
  try {
    parsed = saveMaintenanceInput.parse(rawInput);
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: e instanceof Error ? e.message : "validation failed",
    };
  }

  const ws = ctx.session.workspaceId;
  const actorId = ctx.session.userId;
  const actorIdent = (ctx.session.userId ?? "").slice(0, 50);
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  // delete 권한 체크: deletes 가 있으면 ADMIN 필요
  if (parsed.deletes.length > 0) {
    const adminCtx = await resolveContext(PERMISSIONS.MAINTENANCE_ADMIN);
    if (!adminCtx.ok) {
      return {
        ok: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        error: "Forbidden: delete requires MAINTENANCE_ADMIN",
      };
    }
  }

  try {
    await db.transaction(async (tx) => {
      const auditEntries: Array<{
        action: string;
        resourceId: string;
        details: Record<string, unknown>;
      }> = [];

      for (const c of parsed.creates) {
        const [created] = await tx
          .insert(maintenanceAssignment)
          .values({
            workspaceId: ws,
            userId: c.userId,
            companyId: c.companyId,
            startDate: c.startDate,
            endDate: c.endDate,
            contractNumber: c.contractNumber,
            contractType: c.contractType,
            note: c.note,
            updatedBy: actorIdent,
          })
          .returning({ id: maintenanceAssignment.id });
        if (created) {
          inserted++;
          auditEntries.push({
            action: "maintenance.create",
            resourceId: created.id,
            details: {
              userId: c.userId,
              companyId: c.companyId,
              startDate: c.startDate,
              endDate: c.endDate,
            },
          });
        }
      }

      for (const u of parsed.updates) {
        const values: Record<string, unknown> = {
          updatedAt: new Date(),
          updatedBy: actorIdent,
        };
        if (u.userId !== undefined) values.userId = u.userId;
        if (u.companyId !== undefined) values.companyId = u.companyId;
        if (u.startDate !== undefined) values.startDate = u.startDate;
        if (u.endDate !== undefined) values.endDate = u.endDate;
        if (u.contractNumber !== undefined) values.contractNumber = u.contractNumber;
        if (u.contractType !== undefined) values.contractType = u.contractType;
        if (u.note !== undefined) values.note = u.note;

        const [updatedRow] = await tx
          .update(maintenanceAssignment)
          .set(values)
          .where(
            and(
              eq(maintenanceAssignment.id, u.id),
              eq(maintenanceAssignment.workspaceId, ws),
            ),
          )
          .returning({ id: maintenanceAssignment.id });
        if (updatedRow) {
          updated++;
          auditEntries.push({
            action: "maintenance.update",
            resourceId: updatedRow.id,
            details: { patch: u },
          });
        }
      }

      for (const id of parsed.deletes) {
        const [deletedRow] = await tx
          .delete(maintenanceAssignment)
          .where(
            and(
              eq(maintenanceAssignment.id, id),
              eq(maintenanceAssignment.workspaceId, ws),
            ),
          )
          .returning({ id: maintenanceAssignment.id });
        if (deletedRow) {
          deleted++;
          auditEntries.push({
            action: "maintenance.delete",
            resourceId: deletedRow.id,
            details: {},
          });
        }
      }

      if (auditEntries.length > 0) {
        await tx.insert(auditLog).values(
          auditEntries.map(({ action, resourceId, details }) => ({
            workspaceId: ws,
            userId: actorId,
            action,
            resourceType: "maintenance_assignment",
            resourceId,
            details,
            success: true,
          })),
        );
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    let code = "SAVE_FAILED";
    if (message.toLowerCase().includes("unique")) code = "DUPLICATE";
    return {
      ok: false,
      inserted,
      updated,
      deleted,
      error: `${code}: ${message}`,
    };
  }

  return { ok: true, inserted, updated, deleted };
}

export async function getMaintenanceAssignmentAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.MAINTENANCE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, row: null };

  const id = (rawInput as { id?: string })?.id;
  if (!id || typeof id !== "string") {
    return { ok: false as const, error: "id required", row: null };
  }
  const row = await getMaintenanceAssignment({ workspaceId: ctx.session.workspaceId, id });
  return { ok: true as const, row: row ? toClientRow(row) : null };
}
