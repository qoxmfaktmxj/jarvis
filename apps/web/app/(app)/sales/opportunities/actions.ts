"use server";
import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray, max } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesOpportunity, salesOpportunityMemo, user, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listOpportunitiesInput,
  listOpportunitiesOutput,
  saveOpportunitiesInput,
  saveOpportunitiesOutput,
} from "@jarvis/shared/validation/sales/opportunity";
import {
  opportunityMemoListInput, opportunityMemoListOutput,
  opportunityMemoCreateInput, opportunityMemoCreateOutput,
  opportunityMemoDeleteInput, opportunityMemoDeleteOutput,
} from "@jarvis/shared/validation/sales/opportunity-memo";
import { buildMemoTree } from "@/lib/queries/sales-tabs";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror customers/actions.ts)
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
// listOpportunities
// ---------------------------------------------------------------------------

export async function listOpportunities(rawInput: z.input<typeof listOpportunitiesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listOpportunitiesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesOpportunity.workspaceId, ctx.workspaceId)];
  if (input.q) {
    conditions.push(ilike(salesOpportunity.bizOpNm, `%${input.q}%`));
  }
  if (input.bizStepCode) conditions.push(eq(salesOpportunity.bizStepCode, input.bizStepCode));
  if (input.productTypeCode) conditions.push(eq(salesOpportunity.productTypeCode, input.productTypeCode));
  if (input.focusOnly) conditions.push(eq(salesOpportunity.focusMgrYn, true));

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: salesOpportunity.id,
        bizOpNm: salesOpportunity.bizOpNm,
        customerId: salesOpportunity.customerId,
        customerName: salesOpportunity.customerName,
        productTypeCode: salesOpportunity.productTypeCode,
        bizStepCode: salesOpportunity.bizStepCode,
        bizStepYmd: salesOpportunity.bizStepYmd,
        orgNm: salesOpportunity.orgNm,
        insUserId: salesOpportunity.insUserId,
        insUserName: user.name,
        bizOpSourceCode: salesOpportunity.bizOpSourceCode,
        focusMgrYn: salesOpportunity.focusMgrYn,
        insDate: salesOpportunity.insDate,
      })
      .from(salesOpportunity)
      .leftJoin(user, eq(user.id, salesOpportunity.insUserId))
      .where(where)
      .orderBy(desc(salesOpportunity.insDate))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesOpportunity).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  const parsed = listOpportunitiesOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      bizOpNm: r.bizOpNm,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
      productTypeCode: r.productTypeCode ?? null,
      bizStepCode: r.bizStepCode ?? null,
      bizStepYmd: r.bizStepYmd ?? null,
      orgNm: r.orgNm ?? null,
      insUserId: r.insUserId ?? null,
      insUserName: r.insUserName ?? null,
      bizOpSourceCode: r.bizOpSourceCode ?? null,
      focusMgrYn: r.focusMgrYn,
      insDate: r.insDate ? r.insDate.toISOString() : null,
    })),
    total,
  });

  return { ok: true as const, rows: parsed.rows, total: parsed.total };
}

// ---------------------------------------------------------------------------
// saveOpportunities
// ---------------------------------------------------------------------------

export async function saveOpportunities(rawInput: z.input<typeof saveOpportunitiesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = saveOpportunitiesInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        // insDate / insUserName are read-only; server fills via defaultNow + ctx.userId.
        const { insDate: _omitInsDate, insUserName: _omitInsUserName, insUserId: _omitInsUserId, ...createPayload } = c;
        void _omitInsDate;
        void _omitInsUserName;
        void _omitInsUserId;
        await tx.insert(salesOpportunity).values({
          ...createPayload,
          workspaceId: ctx.workspaceId,
          insUserId: ctx.userId ?? undefined,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.opportunity.create",
          resourceType: "sales_opportunity",
          resourceId: c.id,
          details: { bizOpNm: c.bizOpNm } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // insDate / insUserName / insUserId are read-only on update.
        const {
          insDate: _omitInsDate,
          insUserName: _omitInsUserName,
          insUserId: _omitInsUserId,
          ...updatablePatch
        } = u.patch;
        void _omitInsDate;
        void _omitInsUserName;
        void _omitInsUserId;
        await tx
          .update(salesOpportunity)
          .set({ ...updatablePatch, chkUserId: ctx.userId ?? undefined, chkDate: new Date() })
          .where(
            and(
              eq(salesOpportunity.id, u.id),
              eq(salesOpportunity.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.opportunity.update",
          resourceType: "sales_opportunity",
          resourceId: u.id,
          details: updatablePatch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        await tx.delete(salesOpportunity).where(
          and(
            inArray(salesOpportunity.id, input.deletes),
            eq(salesOpportunity.workspaceId, ctx.workspaceId),
          ),
        );
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.opportunity.delete",
            resourceType: "sales_opportunity",
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

  return saveOpportunitiesOutput.parse({
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

export async function listOpportunityMemos(rawInput: z.input<typeof opportunityMemoListInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };
  const { opportunityId } = opportunityMemoListInput.parse(rawInput);

  const rows = await db
    .select({
      comtSeq: salesOpportunityMemo.comtSeq,
      priorComtSeq: salesOpportunityMemo.priorComtSeq,
      memo: salesOpportunityMemo.memo,
      authorName: user.name,
      insdate: salesOpportunityMemo.insDate,
      insUserId: salesOpportunityMemo.insUserId,
    })
    .from(salesOpportunityMemo)
    .leftJoin(user, eq(user.id, salesOpportunityMemo.insUserId))
    .where(and(
      eq(salesOpportunityMemo.workspaceId, ctx.workspaceId),
      eq(salesOpportunityMemo.opportunityId, opportunityId),
    ))
    .orderBy(salesOpportunityMemo.comtSeq);

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

  return opportunityMemoListOutput.parse({ rows: tree });
}

export async function createOpportunityMemo(rawInput: z.input<typeof opportunityMemoCreateInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return opportunityMemoCreateOutput.parse({ ok: false, comtSeq: null });
  const { opportunityId, priorComtSeq, memo } = opportunityMemoCreateInput.parse(rawInput);

  const nextSeq = await db.transaction(async (tx) => {
    const maxRow = await tx
      .select({ m: max(salesOpportunityMemo.comtSeq) })
      .from(salesOpportunityMemo)
      .where(and(
        eq(salesOpportunityMemo.workspaceId, ctx.workspaceId),
        eq(salesOpportunityMemo.opportunityId, opportunityId),
      ));
    const seq = (maxRow[0]?.m ?? 0) + 1;

    await tx.insert(salesOpportunityMemo).values({
      workspaceId: ctx.workspaceId,
      opportunityId,
      comtSeq: seq,
      priorComtSeq: priorComtSeq === 0 ? null : priorComtSeq,
      memo,
      insUserId: ctx.userId ?? undefined,
    });
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.opportunity.memo.create",
      resourceType: "sales_opportunity_memo",
      resourceId: opportunityId,
      details: { comtSeq: seq, priorComtSeq } as Record<string, unknown>,
      success: true,
    });
    return seq;
  });

  return opportunityMemoCreateOutput.parse({ ok: true, comtSeq: nextSeq });
}

export async function deleteOpportunityMemo(rawInput: z.input<typeof opportunityMemoDeleteInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return opportunityMemoDeleteOutput.parse({ ok: false });
  const { opportunityId, comtSeq } = opportunityMemoDeleteInput.parse(rawInput);

  const sessionId = await resolveSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  const adminBypass = session ? isAdmin(session) : false;

  await db.transaction(async (tx) => {
    const conds = [
      eq(salesOpportunityMemo.workspaceId, ctx.workspaceId),
      eq(salesOpportunityMemo.opportunityId, opportunityId),
      eq(salesOpportunityMemo.comtSeq, comtSeq),
    ];
    if (!adminBypass && ctx.userId) conds.push(eq(salesOpportunityMemo.insUserId, ctx.userId));
    await tx.delete(salesOpportunityMemo).where(and(...conds));

    // Cascade: delete replies of this master (priorComtSeq = comtSeq)
    await tx.delete(salesOpportunityMemo).where(and(
      eq(salesOpportunityMemo.workspaceId, ctx.workspaceId),
      eq(salesOpportunityMemo.opportunityId, opportunityId),
      eq(salesOpportunityMemo.priorComtSeq, comtSeq),
    ));

    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.opportunity.memo.delete",
      resourceType: "sales_opportunity_memo",
      resourceId: opportunityId,
      details: { comtSeq } as Record<string, unknown>,
      success: true,
    });
  });

  return opportunityMemoDeleteOutput.parse({ ok: true });
}
