"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, scheduleEvent } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCalendarEventsInput,
  listSchedulesInput,
  saveSchedulesInput,
  type SaveSchedulesOutput,
  type ScheduleEventRow,
} from "@jarvis/shared/validation/schedule";
import { and, eq } from "drizzle-orm";
import {
  getScheduleById,
  listCalendarEvents,
  listSchedules,
  nextOrderSeq,
  type ScheduleRow,
} from "@/lib/queries/schedule";

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

function toClientRow(r: ScheduleRow): ScheduleEventRow {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    startDate: r.startDate,
    endDate: r.endDate,
    title: r.title,
    memo: r.memo,
    orderSeq: r.orderSeq,
    isShared: r.isShared,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    isOwn: r.isOwn,
  };
}

export async function listSchedulesAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.SCHEDULE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listSchedulesInput.parse(rawInput);
  const result = await listSchedules({
    workspaceId: ctx.session.workspaceId,
    sessionUserId: ctx.session.userId,
    q: input.q,
    activeOn: input.activeOn,
    month: input.month,
    ownOnly: input.ownOnly,
    page: input.page,
    limit: input.limit,
  });

  return {
    ok: true as const,
    rows: result.data.map(toClientRow),
    total: result.pagination.total,
  };
}

export async function getScheduleAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.SCHEDULE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, row: null };

  const id = (rawInput as { id?: string })?.id;
  if (!id || typeof id !== "string") {
    return { ok: false as const, error: "id required", row: null };
  }
  const row = await getScheduleById({
    workspaceId: ctx.session.workspaceId,
    id,
    sessionUserId: ctx.session.userId,
  });
  return { ok: true as const, row: row ? toClientRow(row) : null };
}

export async function listCalendarEventsAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.SCHEDULE_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };

  const input = listCalendarEventsInput.parse(rawInput);
  const rows = await listCalendarEvents({
    workspaceId: ctx.session.workspaceId,
    sessionUserId: ctx.session.userId,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
  return { ok: true as const, rows: rows.map(toClientRow) };
}

export async function saveSchedulesAction(
  rawInput: unknown,
): Promise<SaveSchedulesOutput> {
  const ctx = await resolveContext(PERMISSIONS.SCHEDULE_WRITE);
  if (!ctx.ok) {
    return { ok: false, inserted: 0, updated: 0, deleted: 0, error: ctx.error };
  }

  let parsed;
  try {
    parsed = saveSchedulesInput.parse(rawInput);
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
  const actorUserId = ctx.session.userId;
  const actorIdent = ctx.session.employeeId ?? null;
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      const auditEntries: Array<{
        action: string;
        resourceId: string;
        details: Record<string, unknown>;
      }> = [];

      // Creates: 항상 본인 일정으로 (userId = session)
      for (const c of parsed.creates) {
        const seq =
          c.orderSeq ??
          (await nextOrderSeq({
            userId: actorUserId,
            startDate: c.startDate,
            database: tx as unknown as typeof db,
          }));
        const [created] = await tx
          .insert(scheduleEvent)
          .values({
            workspaceId: ws,
            userId: actorUserId,
            startDate: c.startDate,
            endDate: c.endDate,
            title: c.title,
            memo: c.memo,
            orderSeq: seq,
            isShared: c.isShared,
            updatedBy: actorIdent,
          })
          .returning({ id: scheduleEvent.id });
        if (created) {
          inserted++;
          auditEntries.push({
            action: "schedule.create",
            resourceId: created.id,
            details: {
              startDate: c.startDate,
              endDate: c.endDate,
              title: c.title,
              isShared: c.isShared,
            },
          });
        }
      }

      // Updates: 본인 소유 일정만 (workspaceId + userId 가드)
      for (const u of parsed.updates) {
        const values: Record<string, unknown> = {
          updatedAt: new Date(),
          updatedBy: actorIdent,
        };
        if (u.startDate !== undefined) values.startDate = u.startDate;
        if (u.endDate !== undefined) values.endDate = u.endDate;
        if (u.title !== undefined) values.title = u.title;
        if (u.memo !== undefined) values.memo = u.memo;
        if (u.orderSeq !== undefined) values.orderSeq = u.orderSeq;
        if (u.isShared !== undefined) values.isShared = u.isShared;

        const [updatedRow] = await tx
          .update(scheduleEvent)
          .set(values)
          .where(
            and(
              eq(scheduleEvent.id, u.id),
              eq(scheduleEvent.workspaceId, ws),
              eq(scheduleEvent.userId, actorUserId),
            ),
          )
          .returning({ id: scheduleEvent.id });
        if (updatedRow) {
          updated++;
          auditEntries.push({
            action: "schedule.update",
            resourceId: updatedRow.id,
            details: { patch: u },
          });
        }
      }

      // Deletes: 본인 소유 일정만
      for (const id of parsed.deletes) {
        const [deletedRow] = await tx
          .delete(scheduleEvent)
          .where(
            and(
              eq(scheduleEvent.id, id),
              eq(scheduleEvent.workspaceId, ws),
              eq(scheduleEvent.userId, actorUserId),
            ),
          )
          .returning({ id: scheduleEvent.id });
        if (deletedRow) {
          deleted++;
          auditEntries.push({
            action: "schedule.delete",
            resourceId: deletedRow.id,
            details: {},
          });
        }
      }

      if (auditEntries.length > 0) {
        await tx.insert(auditLog).values(
          auditEntries.map(({ action, resourceId, details }) => ({
            workspaceId: ws,
            userId: actorUserId,
            action,
            resourceType: "schedule_event",
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
