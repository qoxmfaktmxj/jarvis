"use server";
import { cookies, headers } from "next/headers";
import { aliasedTable, and, count, desc, eq, ilike, inArray, max } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesActivity, salesActivityMemo, salesCustomer, user, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listActivitiesInput,
  listActivitiesOutput,
  saveActivitiesInput,
  saveActivitiesOutput,
} from "@jarvis/shared/validation/sales/activity";
import {
  activityMemoListInput, activityMemoListOutput,
  activityMemoCreateInput, activityMemoCreateOutput,
  activityMemoDeleteInput, activityMemoDeleteOutput,
} from "@jarvis/shared/validation/sales/activity-memo";
import { buildMemoTree } from "@/lib/queries/sales-tabs";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror opportunities/actions.ts)
// ---------------------------------------------------------------------------

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

async function resolveSalesContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };

  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }

  const headerStore = await headers();
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
    employeeId: session.employeeId,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

// ---------------------------------------------------------------------------
// listActivities
// ---------------------------------------------------------------------------

export async function listActivities(rawInput: z.input<typeof listActivitiesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listActivitiesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const attendee = aliasedTable(user, "attendee_user");

  const conditions = [eq(salesActivity.workspaceId, ctx.workspaceId)];
  if (input.q) {
    conditions.push(ilike(salesActivity.bizActNm, `%${input.q}%`));
  }
  if (input.opportunityId) conditions.push(eq(salesActivity.opportunityId, input.opportunityId));
  if (input.actTypeCode) conditions.push(eq(salesActivity.actTypeCode, input.actTypeCode));
  if (input.bizStepCode) conditions.push(eq(salesActivity.bizStepCode, input.bizStepCode));
  if (input.customerId) conditions.push(eq(salesActivity.customerId, input.customerId));
  if (input.contactId) conditions.push(eq(salesActivity.contactId, input.contactId));

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: salesActivity.id,
        bizActNm: salesActivity.bizActNm,
        opportunityId: salesActivity.opportunityId,
        customerId: salesActivity.customerId,
        customerName: salesCustomer.custNm,
        actYmd: salesActivity.actYmd,
        actTypeCode: salesActivity.actTypeCode,
        accessRouteCode: salesActivity.accessRouteCode,
        attendeeUserId: salesActivity.attendeeUserId,
        attendeeUserName: attendee.name,
        bizStepCode: salesActivity.bizStepCode,
        productTypeCode: salesActivity.productTypeCode,
        actContent: salesActivity.actContent,
        insDate: salesActivity.insDate,
      })
      .from(salesActivity)
      .leftJoin(salesCustomer, eq(salesCustomer.id, salesActivity.customerId))
      .leftJoin(attendee, eq(attendee.id, salesActivity.attendeeUserId))
      .where(where)
      .orderBy(desc(salesActivity.insDate))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesActivity).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  const parsed = listActivitiesOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      bizActNm: r.bizActNm,
      opportunityId: r.opportunityId ?? null,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
      actYmd: r.actYmd ?? null,
      actTypeCode: r.actTypeCode ?? null,
      accessRouteCode: r.accessRouteCode ?? null,
      attendeeUserId: r.attendeeUserId ?? null,
      attendeeUserName: r.attendeeUserName ?? null,
      bizStepCode: r.bizStepCode ?? null,
      productTypeCode: r.productTypeCode ?? null,
      actContent: r.actContent ?? null,
      insDate: r.insDate ? r.insDate.toISOString() : null,
    })),
    total,
  });

  return { ok: true as const, rows: parsed.rows, total: parsed.total };
}

// ---------------------------------------------------------------------------
// saveActivities
// ---------------------------------------------------------------------------

export async function saveActivities(rawInput: z.input<typeof saveActivitiesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = saveActivitiesInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        // insDate / customerName / attendeeUserName are read-only; server fills via defaultNow + joins.
        const {
          insDate: _omitInsDate,
          customerName: _omitCustomerName,
          attendeeUserName: _omitAttendeeUserName,
          ...createPayload
        } = c;
        void _omitInsDate;
        void _omitCustomerName;
        void _omitAttendeeUserName;
        await tx.insert(salesActivity).values({
          ...createPayload,
          workspaceId: ctx.workspaceId,
          insUserId: ctx.userId ?? undefined,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.activity.create",
          resourceType: "sales_activity",
          resourceId: c.id,
          details: { bizActNm: c.bizActNm } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // insDate / customerName / attendeeUserName are read-only on update.
        const {
          insDate: _omitInsDate,
          customerName: _omitCustomerName,
          attendeeUserName: _omitAttendeeUserName,
          ...updatablePatch
        } = u.patch;
        void _omitInsDate;
        void _omitCustomerName;
        void _omitAttendeeUserName;
        await tx
          .update(salesActivity)
          .set({ ...updatablePatch, chkUserId: ctx.userId ?? undefined, chkDate: new Date() })
          .where(
            and(
              eq(salesActivity.id, u.id),
              eq(salesActivity.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.activity.update",
          resourceType: "sales_activity",
          resourceId: u.id,
          details: updatablePatch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        await tx.delete(salesActivity).where(
          and(
            inArray(salesActivity.id, input.deletes),
            eq(salesActivity.workspaceId, ctx.workspaceId),
          ),
        );
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.activity.delete",
            resourceType: "sales_activity",
            resourceId: id,
            details: {} as Record<string, unknown>,
            success: true,
          });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveActivitiesOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Memo CRUD (Task 7)
// ────────────────────────────────────────────────────────────────────────────

export async function listActivityMemos(rawInput: z.input<typeof activityMemoListInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };
  const { activityId } = activityMemoListInput.parse(rawInput);

  const rows = await db
    .select({
      comtSeq: salesActivityMemo.comtSeq,
      priorComtSeq: salesActivityMemo.priorComtSeq,
      memo: salesActivityMemo.memo,
      authorName: user.name,
      insdate: salesActivityMemo.insDate,
      insUserId: salesActivityMemo.insUserId,
    })
    .from(salesActivityMemo)
    .leftJoin(user, eq(user.id, salesActivityMemo.insUserId))
    .where(and(
      eq(salesActivityMemo.workspaceId, ctx.workspaceId),
      eq(salesActivityMemo.activityId, activityId),
    ))
    .orderBy(salesActivityMemo.comtSeq);

  const tree = buildMemoTree(
    rows.map((r) => ({
      comtSeq: r.comtSeq,
      priorComtSeq: r.priorComtSeq,
      memo: r.memo ?? "",
      authorName: r.authorName,
      insdate: r.insdate.toISOString().slice(0, 16).replace("T", " "),
      createdBy: r.insUserId,
    })),
    ctx.userId ?? null,
  );

  return activityMemoListOutput.parse({ rows: tree });
}

export async function createActivityMemo(rawInput: z.input<typeof activityMemoCreateInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return activityMemoCreateOutput.parse({ ok: false, comtSeq: null });
  const { activityId, priorComtSeq, memo } = activityMemoCreateInput.parse(rawInput);

  const nextSeq = await db.transaction(async (tx) => {
    const maxRow = await tx
      .select({ m: max(salesActivityMemo.comtSeq) })
      .from(salesActivityMemo)
      .where(and(
        eq(salesActivityMemo.workspaceId, ctx.workspaceId),
        eq(salesActivityMemo.activityId, activityId),
      ));
    const seq = (maxRow[0]?.m ?? 0) + 1;

    await tx.insert(salesActivityMemo).values({
      workspaceId: ctx.workspaceId,
      activityId,
      comtSeq: seq,
      priorComtSeq: priorComtSeq === 0 ? null : priorComtSeq,
      memo,
      insUserId: ctx.userId ?? undefined,
    });
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.activity.memo.create",
      resourceType: "sales_activity_memo",
      resourceId: activityId,
      details: { comtSeq: seq, priorComtSeq } as Record<string, unknown>,
      success: true,
    });
    return seq;
  });

  return activityMemoCreateOutput.parse({ ok: true, comtSeq: nextSeq });
}

export async function deleteActivityMemo(rawInput: z.input<typeof activityMemoDeleteInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return activityMemoDeleteOutput.parse({ ok: false });
  const { activityId, comtSeq } = activityMemoDeleteInput.parse(rawInput);

  const sessionId = await resolveSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  const adminBypass = session ? isAdmin(session) : false;

  await db.transaction(async (tx) => {
    const conds = [
      eq(salesActivityMemo.workspaceId, ctx.workspaceId),
      eq(salesActivityMemo.activityId, activityId),
      eq(salesActivityMemo.comtSeq, comtSeq),
    ];
    if (!adminBypass && ctx.userId) conds.push(eq(salesActivityMemo.insUserId, ctx.userId));
    await tx.delete(salesActivityMemo).where(and(...conds));

    // Cascade: delete replies of this master (priorComtSeq = comtSeq)
    await tx.delete(salesActivityMemo).where(and(
      eq(salesActivityMemo.workspaceId, ctx.workspaceId),
      eq(salesActivityMemo.activityId, activityId),
      eq(salesActivityMemo.priorComtSeq, comtSeq),
    ));

    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.activity.memo.delete",
      resourceType: "sales_activity_memo",
      resourceId: activityId,
      details: { comtSeq } as Record<string, unknown>,
      success: true,
    });
  });

  return activityMemoDeleteOutput.parse({ ok: true });
}

// ---------------------------------------------------------------------------
// getActivity — single activity fetch for /[id]/edit page
// ---------------------------------------------------------------------------
export async function getActivity(input: { id: string }) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const attendee = aliasedTable(user, "att_user");
  const [row] = await db
    .select({
      id: salesActivity.id,
      bizActNm: salesActivity.bizActNm,
      opportunityId: salesActivity.opportunityId,
      customerId: salesActivity.customerId,
      contactId: salesActivity.contactId,
      customerName: salesCustomer.custNm,
      actYmd: salesActivity.actYmd,
      actTypeCode: salesActivity.actTypeCode,
      accessRouteCode: salesActivity.accessRouteCode,
      bizStepCode: salesActivity.bizStepCode,
      productTypeCode: salesActivity.productTypeCode,
      actContent: salesActivity.actContent,
      attendeeUserId: salesActivity.attendeeUserId,
      attendeeUserName: attendee.name,
      memo: salesActivity.memo,
      insDate: salesActivity.insDate,
    })
    .from(salesActivity)
    .leftJoin(salesCustomer, eq(salesActivity.customerId, salesCustomer.id))
    .leftJoin(attendee, eq(salesActivity.attendeeUserId, attendee.id))
    .where(and(eq(salesActivity.id, input.id), eq(salesActivity.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!row) return { ok: false as const, error: "NotFound" as const };
  return {
    ok: true as const,
    activity: {
      ...row,
      insDate: row.insDate ? row.insDate.toISOString() : null,
    },
  };
}
