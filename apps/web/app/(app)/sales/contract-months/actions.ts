"use server";

import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContractMonth, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listContractMonthsInput,
  saveContractMonthsInput,
  getContractMonthInput,
  type SalesContractMonthRow,
} from "@jarvis/shared/validation/sales-contract";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Session helpers (same pattern as sales/contracts/actions.ts)
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
// Serializer
// ---------------------------------------------------------------------------

function serializeContractMonth(r: typeof salesContractMonth.$inferSelect): SalesContractMonthRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    contractId: r.contractId,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    legacySeq: r.legacySeq ?? null,
    legacyYm: r.legacyYm ?? null,
    ym: r.ym,
    billTargetYn: r.billTargetYn ?? null,
    // PLAN
    planInManMonth: r.planInManMonth ?? null,
    planOutManMonth: r.planOutManMonth ?? null,
    planServSaleAmt: r.planServSaleAmt ?? null,
    planProdSaleAmt: r.planProdSaleAmt ?? null,
    planInfSaleAmt: r.planInfSaleAmt ?? null,
    planServInCostAmt: r.planServInCostAmt ?? null,
    planServOutCostAmt: r.planServOutCostAmt ?? null,
    planProdCostAmt: r.planProdCostAmt ?? null,
    planInCostAmt: r.planInCostAmt ?? null,
    planOutCostAmt: r.planOutCostAmt ?? null,
    planIndirectGrpAmt: r.planIndirectGrpAmt ?? null,
    planIndirectComAmt: r.planIndirectComAmt ?? null,
    planRentAmt: r.planRentAmt ?? null,
    planSgaAmt: r.planSgaAmt ?? null,
    planExpAmt: r.planExpAmt ?? null,
    // VIEW
    viewInManMonth: r.viewInManMonth ?? null,
    viewOutManMonth: r.viewOutManMonth ?? null,
    viewServSaleAmt: r.viewServSaleAmt ?? null,
    viewProdSaleAmt: r.viewProdSaleAmt ?? null,
    viewInfSaleAmt: r.viewInfSaleAmt ?? null,
    viewServInCostAmt: r.viewServInCostAmt ?? null,
    viewServOutCostAmt: r.viewServOutCostAmt ?? null,
    viewProdCostAmt: r.viewProdCostAmt ?? null,
    viewInCostAmt: r.viewInCostAmt ?? null,
    viewOutCostAmt: r.viewOutCostAmt ?? null,
    viewIndirectGrpAmt: r.viewIndirectGrpAmt ?? null,
    viewIndirectComAmt: r.viewIndirectComAmt ?? null,
    viewRentAmt: r.viewRentAmt ?? null,
    viewSgaAmt: r.viewSgaAmt ?? null,
    viewExpAmt: r.viewExpAmt ?? null,
    // PERF
    perfInManMonth: r.perfInManMonth ?? null,
    perfOutManMonth: r.perfOutManMonth ?? null,
    perfServSaleAmt: r.perfServSaleAmt ?? null,
    perfProdSaleAmt: r.perfProdSaleAmt ?? null,
    perfInfSaleAmt: r.perfInfSaleAmt ?? null,
    perfServInCostAmt: r.perfServInCostAmt ?? null,
    perfServOutCostAmt: r.perfServOutCostAmt ?? null,
    perfProdCostAmt: r.perfProdCostAmt ?? null,
    perfInCostAmt: r.perfInCostAmt ?? null,
    perfOutCostAmt: r.perfOutCostAmt ?? null,
    perfIndirectGrpAmt: r.perfIndirectGrpAmt ?? null,
    perfIndirectComAmt: r.perfIndirectComAmt ?? null,
    perfRentAmt: r.perfRentAmt ?? null,
    perfSgaAmt: r.perfSgaAmt ?? null,
    perfExpAmt: r.perfExpAmt ?? null,
    // Tax
    taxOrderAmt: r.taxOrderAmt ?? null,
    taxServAmt: r.taxServAmt ?? null,
    // Finalize
    rfcEndYn: r.rfcEndYn ?? null,
    note: r.note ?? null,
    // Audit
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

// ---------------------------------------------------------------------------
// getContractMonth (single-row fetch)
// ---------------------------------------------------------------------------

export async function getContractMonth(
  rawInput: unknown,
): Promise<{ ok: true; contractMonth: SalesContractMonthRow | null } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return ctx;

  const input = getContractMonthInput.parse(rawInput);

  const [row] = await db
    .select()
    .from(salesContractMonth)
    .where(
      and(
        eq(salesContractMonth.id, input.id),
        eq(salesContractMonth.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);

  if (!row) return { ok: true as const, contractMonth: null };

  return { ok: true as const, contractMonth: serializeContractMonth(row) };
}

// ---------------------------------------------------------------------------
// listContractMonths
// ---------------------------------------------------------------------------

export async function listContractMonths(rawInput: unknown): Promise<{
  ok: boolean;
  rows: SalesContractMonthRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 };

  const input = listContractMonthsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesContractMonth.workspaceId, ctx.workspaceId)];

  if (input.q) conditions.push(ilike(salesContractMonth.note, `%${input.q}%`));
  if (input.contractId) conditions.push(eq(salesContractMonth.contractId, input.contractId));
  if (input.ym) conditions.push(eq(salesContractMonth.ym, input.ym));

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesContractMonth)
      .where(where)
      .orderBy(desc(salesContractMonth.ym), desc(salesContractMonth.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesContractMonth).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    ok: true,
    rows: rows.map(serializeContractMonth),
    total,
    page: input.page,
    limit: input.limit,
  };
}

// ---------------------------------------------------------------------------
// saveContractMonths
// ---------------------------------------------------------------------------

export async function saveContractMonths(rawInput: unknown): Promise<{
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

  const input = saveContractMonthsInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];

  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      if (input.creates.length > 0) {
        const ins = await tx
          .insert(salesContractMonth)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesContractMonth.id });
        created = ins.length;

        if (ins.length > 0) {
          await tx.insert(auditLog).values(
            ins.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract_month.batch_save",
              resourceType: "sales_contract_month",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx
          .update(salesContractMonth)
          .set({
            ...patch,
            updatedBy: ctx.userId ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesContractMonth.id, id),
              eq(salesContractMonth.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: salesContractMonth.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.contract_month.batch_save",
            resourceType: "sales_contract_month",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesContractMonth)
          .where(
            and(
              eq(salesContractMonth.workspaceId, ctx.workspaceId),
              inArray(salesContractMonth.id, input.deletes),
            ),
          )
          .returning({ id: salesContractMonth.id });
        deleted = removed.length;

        if (removed.length > 0) {
          await tx.insert(auditLog).values(
            removed.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract_month.batch_save",
              resourceType: "sales_contract_month",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    errors.push({ code: "SAVE_FAILED", message });
  }

  revalidatePath("/sales/contract-months");

  return {
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
