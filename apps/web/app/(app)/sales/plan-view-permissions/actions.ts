"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, notExists, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, salesPlanAcl, salesPlanViewPerformance, salesPlanViewPerformanceMonth } from "@jarvis/db/schema";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import {
  listPlanViewPermissionsInput,
  salesPlanViewPerformanceRowSchema,
  savePlanAclInput,
  savePlanViewPermissionsInput,
  type SalesPlanViewPerformanceRow,
} from "@jarvis/shared/validation/sales-contract-extra";
import { resolveSalesContext } from "../_lib/sales-context";
import { evaluatePlanAcl } from "./acl-helpers";

// A4 P0-2 fix — 공유 `resolveSalesContext`(`../_lib/sales-context`)를 사용.
// 이전에는 로컬에서 resolveSessionId + resolveSalesContext + isAdmin 묶음을
// 재구현했으나, _lib 헬퍼가 `isAdmin` 필드를 반환하도록 확장되어 중복 제거.
// ADMIN_ALL bypasses sales_plan_acl row-level checks. SALES_ALL alone gates
// the domain; ACL further narrows per-(plan, user). Option B: 없는 ACL row =
// allow, 명시적 `canRead=false` / `canWrite=false`만 deny — admin은 둘 다 면제.

async function checkPlanAcl(
  ctx: { workspaceId: string; userId: string; isAdmin: boolean },
  planId: string,
  mode: "read" | "write",
): Promise<boolean> {
  if (ctx.isAdmin) return true;
  // A4 P0-1 fix — salesPlanAcl 자체에는 workspace_id 컬럼이 없어
  // INNER JOIN으로 plan이 현재 workspace 소속인지 강제 검증한다.
  // (다른 워크스페이스 사용자가 plan_id 알아내도 ACL 조회 차단)
  const [acl] = await db
    .select({ canRead: salesPlanAcl.canRead, canWrite: salesPlanAcl.canWrite })
    .from(salesPlanAcl)
    .innerJoin(
      salesPlanViewPerformance,
      and(
        eq(salesPlanAcl.planId, salesPlanViewPerformance.id),
        eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId),
      ),
    )
    .where(and(eq(salesPlanAcl.planId, planId), eq(salesPlanAcl.userId, ctx.userId)))
    .limit(1);
  return evaluatePlanAcl(acl, ctx.isAdmin, mode);
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

  // Row-level ACL enforcement at the query layer (Option B semantics).
  // SALES_ALL gates the domain; salesPlanAcl narrows visibility per (plan, user).
  // Semantics: "explicit deny" (canRead = false) hides the row. Missing ACL row
  // or canRead = true/null = allow (fall back to permission). Without this
  // filter the LEFT JOIN below would still surface deny rows in the grid.
  // Admins bypass — they see every row regardless of ACL.
  // A4 P0-1 — outer `conditions` already restricts to ctx.workspaceId via
  // `eq(salesPlanViewPerformance.workspaceId, ctx.workspaceId)` (line 94),
  // so the notExists correlation through salesPlanViewPerformance.id is
  // already workspace-scoped. No cross-workspace leak from this subquery.
  if (!ctx.isAdmin) {
    conditions.push(
      notExists(
        db
          .select({ one: salesPlanAcl.planId })
          .from(salesPlanAcl)
          .where(
            and(
              eq(salesPlanAcl.planId, salesPlanViewPerformance.id),
              eq(salesPlanAcl.userId, ctx.userId),
              eq(salesPlanAcl.canRead, false),
            ),
          ),
      ),
    );
  }

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

  // A4 P0-3 fix — ACL upsert + audit_log을 같은 트랜잭션으로 묶고, `before`/
  // `after` diff를 audit_log.details에 첨부한다. 이전에는 `db.insert(salesPlanAcl)`
  // + 별도 `db.insert(auditLog)` 두 개의 독립 query라, ACL 변경은 성공하고
  // audit_log insert가 실패하면 audit 누락 (감사 추적 깨짐).
  //
  // A4 P0-1 — salesPlanAcl 자체에는 workspace_id 컬럼이 없지만, 위 plan 존재
  // 검증이 `eq(workspaceId, ctx.workspaceId)`로 게이트되므로 다른 워크스페이스
  // plan_id로의 ACL 삽입은 도달 불가능 (cross-tenant write 차단).
  await db.transaction(async (tx) => {
    // 이전 상태(있다면) — diff 생성용. 같은 트랜잭션 안에서 upsert 전에 SELECT.
    const [prior] = await tx
      .select({
        canRead: salesPlanAcl.canRead,
        canWrite: salesPlanAcl.canWrite,
      })
      .from(salesPlanAcl)
      .where(
        and(eq(salesPlanAcl.planId, input.planId), eq(salesPlanAcl.userId, input.userId)),
      )
      .limit(1);

    await tx
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

    await writeAuditLog(tx, auditLog, {
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
      before: prior ? { canRead: prior.canRead, canWrite: prior.canWrite } : {},
      after: { canRead: input.canRead, canWrite: input.canWrite },
      success: true,
    });
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

  // Option B ACL: deny detail read when ACL row has `canRead = false`.
  // Returning Forbidden (not NotFound) so the UI can distinguish missing
  // resource from permission denial. `canWrite` is also surfaced so the
  // detail page can disable the save button without round-tripping for a
  // 403 — the server still enforces the write check independently.
  const canRead = await checkPlanAcl(ctx, input.id, "read");
  if (!canRead) return { ok: false as const, error: "Forbidden" as const };
  const canWrite = await checkPlanAcl(ctx, input.id, "write");

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
    canWrite,
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

// `.finite()` rejects NaN / +Infinity / -Infinity at the boundary so we never
// stringify them into PostgreSQL numeric(15,10). JS doubles can represent up
// to ~15-17 significant decimal digits which covers 5 digits before + 10
// after the decimal point that the column expects.
const finiteNullable = () => _z.number().finite().nullable().optional();
const monthRowPatch = _z.object({
  id: _z.string().uuid(),
  ym: _z.string().regex(/^\d{6}$/),
  serOrderAmt: finiteNullable(),
  prdOrderAmt: finiteNullable(),
  infOrderAmt: finiteNullable(),
  servAmt: finiteNullable(),
  prodAmt: finiteNullable(),
  inManMonth: finiteNullable(),
  outManMonth: finiteNullable(),
  dirInAmt: finiteNullable(),
  dirOutAmt: finiteNullable(),
  indirOrgAmt: finiteNullable(),
  indirAllAmt: finiteNullable(),
  sgaAmt: finiteNullable(),
  expAmt: finiteNullable(),
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

  // Option B ACL: deny month-level write when ACL has `canWrite = false`.
  // Read access (canRead) is implicit — without it the user couldn't have
  // navigated to the detail page in the first place. This guard is the
  // dedicated write check.
  const canWrite = await checkPlanAcl(ctx, input.planId, "write");
  if (!canWrite) return { ok: false as const, error: "Forbidden" as const };

  const now = new Date();
  let updated = 0;
  // Per-row audit detail — captures which months changed and which numeric
  // fields were touched so audit_log queries can answer "who changed what
  // cell" not just "N rows changed at time T". Legacy mmPlanViewPerMgrDetailPop
  // wrote per-cell tx logs; this preserves equivalent forensic resolution.
  const auditChanges: Array<{ ym: string; rowId: string; fields: string[] }> = [];
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
      const touchedFields: string[] = [];
      for (const k of numericKeys) {
        const v = r[k];
        if (v === undefined) continue;
        if (v === null) {
          patch[k] = null;
          touchedFields.push(k);
        } else if (Number.isFinite(v)) {
          // String() yields a canonical decimal that PostgreSQL's numeric(15,10)
          // parser handles without loss within JS double precision. The Zod
          // `.finite()` guard above already rejected NaN/Infinity at the API
          // boundary; this check is defense-in-depth.
          patch[k] = String(v);
          touchedFields.push(k);
        }
      }
      const res = await tx.update(salesPlanViewPerformanceMonth)
        .set(patch)
        .where(and(
          eq(salesPlanViewPerformanceMonth.id, r.id),
          eq(salesPlanViewPerformanceMonth.workspaceId, ctx.workspaceId),
          eq(salesPlanViewPerformanceMonth.planId, input.planId),
        ))
        .returning({ id: salesPlanViewPerformanceMonth.id });
      if (res.length > 0) {
        updated += 1;
        if (touchedFields.length > 0) {
          auditChanges.push({ ym: r.ym, rowId: r.id, fields: touchedFields });
        }
      }
    }
    if (updated > 0) {
      await tx.insert(auditLog).values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "sales.plan_view_performance_month.update",
        resourceType: "sales_plan_view_performance_month",
        resourceId: input.planId,
        details: { count: updated, changes: auditChanges },
        success: true,
      });
    }
  });

  revalidatePath(`/sales/plan-view-permissions/${input.planId}/detail`);
  return { ok: true as const, updated };
}
