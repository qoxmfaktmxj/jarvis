"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, salesPlanAcl, salesPlanViewPerformance, salesPlanViewPerformanceMonth } from "@jarvis/db/schema";
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

// ---------------------------------------------------------------------------
// getPlanViewPerformance — single master + 12 monthly breakdown rows
// (legacy mmPlanViewPerMgrDetailPop.jsp 의 React 포팅; read-only detail view)
// ---------------------------------------------------------------------------
export async function getPlanViewPerformance(input: { id: string }) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const [master] = await db
    .select()
    .from(salesPlanViewPerformance)
    .where(and(
      eq(salesPlanViewPerformance.id, input.id),
      eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
    ))
    .limit(1);

  if (!master) return { ok: false as const, error: "NotFound" as const };

  const months = await db
    .select()
    .from(salesPlanViewPerformanceMonth)
    .where(and(
      eq(salesPlanViewPerformanceMonth.planId, input.id),
      eq(salesPlanViewPerformanceMonth.workspaceId, ctx.workspaceId),
    ))
    .orderBy(salesPlanViewPerformanceMonth.ym);

  return {
    ok: true as const,
    master: {
      id: master.id,
      dataType: master.dataType,
      contYear: master.contYear,
      pjtCode: master.pjtCode,
      pjtNm: master.pjtNm ?? null,
      companyCd: master.companyCd,
      companyNm: master.companyNm ?? null,
      custNm: master.custNm ?? null,
      title: master.title ?? null,
      contType: master.contType ?? null,
      productType: master.productType ?? null,
      contSymd: master.contSymd ?? null,
      contEymd: master.contEymd ?? null,
      totOrderAmt: master.totOrderAmt != null ? Number(master.totOrderAmt) : null,
      serOrderAmt: master.serOrderAmt != null ? Number(master.serOrderAmt) : null,
      prdOrderAmt: master.prdOrderAmt != null ? Number(master.prdOrderAmt) : null,
      infOrderAmt: master.infOrderAmt != null ? Number(master.infOrderAmt) : null,
      servAmt: master.servAmt != null ? Number(master.servAmt) : null,
      prodAmt: master.prodAmt != null ? Number(master.prodAmt) : null,
      sgaAmt: master.sgaAmt != null ? Number(master.sgaAmt) : null,
      expAmt: master.expAmt != null ? Number(master.expAmt) : null,
    },
    months: months.map((m) => ({
      id: m.id,
      ym: m.ym,
      serOrderAmt: m.serOrderAmt != null ? Number(m.serOrderAmt) : null,
      prdOrderAmt: m.prdOrderAmt != null ? Number(m.prdOrderAmt) : null,
      infOrderAmt: m.infOrderAmt != null ? Number(m.infOrderAmt) : null,
      servAmt: m.servAmt != null ? Number(m.servAmt) : null,
      prodAmt: m.prodAmt != null ? Number(m.prodAmt) : null,
      inManMonth: m.inManMonth != null ? Number(m.inManMonth) : null,
      outManMonth: m.outManMonth != null ? Number(m.outManMonth) : null,
      dirInAmt: m.dirInAmt != null ? Number(m.dirInAmt) : null,
      dirOutAmt: m.dirOutAmt != null ? Number(m.dirOutAmt) : null,
      indirOrgAmt: m.indirOrgAmt != null ? Number(m.indirOrgAmt) : null,
      indirAllAmt: m.indirAllAmt != null ? Number(m.indirAllAmt) : null,
      sgaAmt: m.sgaAmt != null ? Number(m.sgaAmt) : null,
      expAmt: m.expAmt != null ? Number(m.expAmt) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// savePlanViewPerformanceMonths — batch upsert 12 monthly rows
// (legacy mmPlanViewPerMgrDetailPop.jsp 의 DoSave 매칭)
// ---------------------------------------------------------------------------
import { z as _z } from "zod";

const monthRowPatch = _z.object({
  id: _z.string().uuid(),
  ym: _z.string().regex(/^\d{6}$/),
  serOrderAmt: _z.number().nullable().optional(),
  prdOrderAmt: _z.number().nullable().optional(),
  infOrderAmt: _z.number().nullable().optional(),
  servAmt: _z.number().nullable().optional(),
  prodAmt: _z.number().nullable().optional(),
  inManMonth: _z.number().nullable().optional(),
  outManMonth: _z.number().nullable().optional(),
  dirInAmt: _z.number().nullable().optional(),
  dirOutAmt: _z.number().nullable().optional(),
  indirOrgAmt: _z.number().nullable().optional(),
  indirAllAmt: _z.number().nullable().optional(),
  sgaAmt: _z.number().nullable().optional(),
  expAmt: _z.number().nullable().optional(),
});

const savePlanViewPerformanceMonthsInput = _z.object({
  planId: _z.string().uuid(),
  rows: _z.array(monthRowPatch),
});

export async function savePlanViewPerformanceMonths(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const input = savePlanViewPerformanceMonthsInput.parse(rawInput);

  const [master] = await db
    .select({ id: salesPlanViewPerformance.id })
    .from(salesPlanViewPerformance)
    .where(and(
      eq(salesPlanViewPerformance.id, input.planId),
      eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
    ))
    .limit(1);
  if (!master) return { ok: false as const, error: "NotFound" };

  const now = new Date();
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const r of input.rows) {
      const patch: Record<string, unknown> = {
        updatedAt: now,
        updatedBy: ctx.userId,
      };
      const numericKeys = [
        "serOrderAmt", "prdOrderAmt", "infOrderAmt",
        "servAmt", "prodAmt",
        "inManMonth", "outManMonth",
        "dirInAmt", "dirOutAmt",
        "indirOrgAmt", "indirAllAmt",
        "sgaAmt", "expAmt",
      ] as const;
      for (const k of numericKeys) {
        const v = r[k];
        if (v !== undefined) patch[k] = v == null ? null : String(v);
      }
      const res = await tx.update(salesPlanViewPerformanceMonth)
        .set(patch)
        .where(and(
          eq(salesPlanViewPerformanceMonth.id, r.id),
          eq(salesPlanViewPerformanceMonth.workspaceId, ctx.workspaceId),
          eq(salesPlanViewPerformanceMonth.planId, input.planId),
        ))
        .returning({ id: salesPlanViewPerformanceMonth.id });
      if (res.length > 0) updated += 1;
    }
    if (updated > 0) {
      await tx.insert(auditLog).values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "sales.plan_view_performance_month.update",
        resourceType: "sales_plan_view_performance_month",
        resourceId: input.planId,
        details: { count: updated },
        success: true,
      });
    }
  });

  revalidatePath(`/sales/plan-view-permissions/${input.planId}/detail`);
  return { ok: true as const, updated };
}
