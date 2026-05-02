"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, salesPlanAcl, salesPlanViewPerformance } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listPlanViewPermissionsInput,
  salesPlanViewPerformanceRowSchema,
  savePlanAclInput,
  savePlanViewPermissionsInput,
  type SalesPlanViewPerformanceRow,
} from "@jarvis/shared/validation/sales-contract-extra";

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

  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
}

function serializePlanRow(
  row: typeof salesPlanViewPerformance.$inferSelect,
  acl?: { canRead: boolean | null; canWrite: boolean | null },
): SalesPlanViewPerformanceRow {
  return salesPlanViewPerformanceRowSchema.parse({
    ...row,
    canRead: acl?.canRead ?? true,
    canWrite: acl?.canWrite ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  });
}

export async function listPlanViewPermissions(rawInput: unknown): Promise<{
  ok: boolean;
  rows: SalesPlanViewPerformanceRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 };

  const input = listPlanViewPermissionsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;
  const conditions = [eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId)];

  if (input.q) {
    const search = or(
      ilike(salesPlanViewPerformance.companyNm, `%${input.q}%`),
      ilike(salesPlanViewPerformance.pjtNm, `%${input.q}%`),
      ilike(salesPlanViewPerformance.title, `%${input.q}%`),
      ilike(salesPlanViewPerformance.pjtCode, `%${input.q}%`),
    );
    if (search) conditions.push(search);
  }
  if (input.contYear) conditions.push(eq(salesPlanViewPerformance.contYear, input.contYear));
  if (input.companyCd) conditions.push(eq(salesPlanViewPerformance.companyCd, input.companyCd));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        plan: salesPlanViewPerformance,
        canRead: salesPlanAcl.canRead,
        canWrite: salesPlanAcl.canWrite,
      })
      .from(salesPlanViewPerformance)
      .leftJoin(
        salesPlanAcl,
        and(
          eq(salesPlanAcl.planId, salesPlanViewPerformance.id),
          eq(salesPlanAcl.userId, ctx.userId),
        ),
      )
      .where(where)
      .orderBy(desc(salesPlanViewPerformance.contYear), desc(salesPlanViewPerformance.updatedAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesPlanViewPerformance).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map((row) =>
      serializePlanRow(row.plan, { canRead: row.canRead, canWrite: row.canWrite }),
    ),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function savePlanViewPermissions(rawInput: unknown): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  errors?: { code: string; message: string }[];
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [{ code: "UNAUTHORIZED", message: ctx.error }],
    };
  }

  const input = savePlanViewPermissionsInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const inserted = await tx
          .insert(salesPlanViewPerformance)
          .values(
            input.creates.map((row) => ({
              ...row,
              workspaceId: ctx.workspaceId,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesPlanViewPerformance.id });
        created = inserted.length;

        if (inserted.length > 0) {
          await tx.insert(auditLog).values(
            inserted.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.plan_view.create",
              resourceType: "sales_plan_view_performance",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }

      for (const update of input.updates) {
        const { id, ...patch } = update;
        const [row] = await tx
          .update(salesPlanViewPerformance)
          .set({
            ...patch,
            updatedBy: ctx.userId ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesPlanViewPerformance.id, id),
              eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: salesPlanViewPerformance.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.plan_view.update",
            resourceType: "sales_plan_view_performance",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesPlanViewPerformance)
          .where(
            and(
              eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
              inArray(salesPlanViewPerformance.id, input.deletes),
            ),
          )
          .returning({ id: salesPlanViewPerformance.id });
        deleted = removed.length;
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    errors.push({ code: "SAVE_FAILED", message });
  }

  revalidatePath("/sales/plan-view-permissions");
  return {
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

export async function savePlanAcl(rawInput: unknown): Promise<{
  ok: boolean;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = savePlanAclInput.parse(rawInput);
  const [plan] = await db
    .select({ id: salesPlanViewPerformance.id })
    .from(salesPlanViewPerformance)
    .where(
      and(
        eq(salesPlanViewPerformance.id, input.planId),
        eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);

  if (!plan) return { ok: false, error: "Plan row not found" };

  await db
    .insert(salesPlanAcl)
    .values({
      planId: input.planId,
      userId: input.userId,
      canRead: input.canRead,
      canWrite: input.canWrite,
    })
    .onConflictDoUpdate({
      target: [salesPlanAcl.planId, salesPlanAcl.userId],
      set: {
        canRead: input.canRead,
        canWrite: input.canWrite,
      },
    });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.plan_acl.upsert",
    resourceType: "sales_plan_acl",
    resourceId: input.planId,
    details: {
      targetUserId: input.userId,
      canRead: input.canRead,
      canWrite: input.canWrite,
    },
    success: true,
  });

  revalidatePath("/sales/plan-view-permissions");
  return { ok: true };
}
