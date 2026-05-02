"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, like } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import type { z } from "zod";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  salesContract,
  salesMonthExpSga,
  salesPlanDivCost,
  salesPlanDivCostDetail,
  salesPurchase,
  salesPurchaseProject,
  salesTaxBill,
} from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listMonthExpSgaInput,
  listPlanDivCostDetailsInput,
  listPlanDivCostsInput,
  listPurchaseProjectsInput,
  listPurchasesInput,
  listTaxBillsInput,
  saveMonthExpSgaInput,
  savePlanDivCostDetailsInput,
  savePlanDivCostsInput,
  savePurchaseProjectsInput,
  savePurchasesInput,
  saveTaxBillsInput,
  type SalesMonthExpSgaRow,
  type SalesPlanDivCostDetailRow,
  type SalesPlanDivCostRow,
  type SalesPurchaseProjectRow,
  type SalesPurchaseRow,
  type SalesTaxBillRow,
} from "@jarvis/shared/validation/sales-finance";
import {
  EXPORT_ROW_LIMIT,
  enforceExportLimit,
  exportToExcel,
} from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";

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

type ListResult<T> = {
  ok: boolean;
  rows: T[];
  total: number;
  page: number;
  limit: number;
  error?: string;
};

type SaveResult = {
  ok: boolean;
  created: string[];
  updated: string[];
  deleted: string[];
  errors?: { message: string }[];
};

function auditValues(
  ctx: { workspaceId: string; userId: string | null },
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown> = {},
) {
  return {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action,
    resourceType,
    resourceId,
    details,
    success: true,
  };
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function serializePurchase(
  r: typeof salesPurchase.$inferSelect,
  display?: { contNm: string | null },
): SalesPurchaseRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    legacySeq: r.legacySeq ?? null,
    legacyPurSeq: r.legacyPurSeq ?? null,
    purType: r.purType ?? null,
    sdate: r.sdate ?? null,
    edate: r.edate ?? null,
    purNm: r.purNm ?? null,
    subAmt: r.subAmt ?? null,
    amt: r.amt ?? null,
    servSabun: r.servSabun ?? null,
    servName: r.servName ?? null,
    servBirthday: r.servBirthday ?? null,
    servTelNo: r.servTelNo ?? null,
    servAddr: r.servAddr ?? null,
    note: r.note ?? null,
    contNm: display?.contNm ?? null,
    detail: null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

function serializeTaxBill(
  r: typeof salesTaxBill.$inferSelect,
  display?: { contNm: string | null },
): SalesTaxBillRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacyContNo: r.legacyContNo ?? null,
    legacySeq: r.legacySeq ?? null,
    ym: r.ym ?? null,
    orderDivCd: r.orderDivCd ?? null,
    costCd: r.costCd ?? null,
    pjtNm: r.pjtNm ?? null,
    pjtCode: r.pjtCode ?? null,
    purSeq: r.purSeq ?? null,
    debitCreditCd: r.debitCreditCd ?? null,
    slipTargetYn: r.slipTargetYn ?? null,
    billType: r.billType ?? null,
    slipSeq: r.slipSeq ?? null,
    transCode: r.transCode ?? null,
    docDate: r.docDate ?? null,
    slipType: r.slipType ?? null,
    compCd: r.compCd ?? null,
    postDate: r.postDate ?? null,
    currencyType: r.currencyType ?? null,
    referSlipNo: r.referSlipNo ?? null,
    postKey: r.postKey ?? null,
    accountType: r.accountType ?? null,
    businessArea: r.businessArea ?? null,
    amt: r.amt ?? null,
    vatAmt: r.vatAmt ?? null,
    briefsTxt: r.briefsTxt ?? null,
    slipResultYn: r.slipResultYn ?? null,
    servSabun: r.servSabun ?? null,
    servName: r.servName ?? null,
    servBirthday: r.servBirthday ?? null,
    servTelNo: r.servTelNo ?? null,
    servAddr: r.servAddr ?? null,
    taxCode: r.taxCode ?? null,
    businessLocation: r.businessLocation ?? null,
    companyNm: r.companyNm ?? null,
    receiptCd: r.receiptCd ?? null,
    contNm: display?.contNm ?? null,
    receiptNo: null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

function serializeMonthExpSga(r: typeof salesMonthExpSga.$inferSelect): SalesMonthExpSgaRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    yyyy: r.yyyy ?? null,
    mm: r.mm ?? null,
    costCd: r.costCd ?? null,
    expAmt: r.expAmt ?? null,
    sgaAmt: r.sgaAmt ?? null,
    waers: r.waers ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

function serializePlanDivCost(r: typeof salesPlanDivCost.$inferSelect): SalesPlanDivCostRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    costCd: r.costCd ?? null,
    accountType: r.accountType ?? null,
    ym: r.ym ?? null,
    planAmt: r.planAmt ?? null,
    prdtAmt: r.prdtAmt ?? null,
    performAmt: r.performAmt ?? null,
    note: r.note ?? null,
    costNm: null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

/**
 * Shared WHERE-clause builders. Each `build*Conditions` mirrors the filter
 * logic that `listFoo` previously inlined. Both `listFoo` and the export
 * sibling now consume the same builder so they cannot drift on filters.
 *
 * Inputs are post-Zod-parse for type safety. The workspace scope condition
 * is included so callers can use the result directly with `and(...rest)`.
 */
type PurchasesFilterInput = z.infer<typeof listPurchasesInput>;
function buildPurchasesConditions(workspaceId: string, input: PurchasesFilterInput) {
  const conditions = [eq(salesPurchase.workspaceId, workspaceId)];
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(salesPurchase.purNm, q),
      ilike(salesPurchase.legacyContNo, q),
      ilike(salesPurchase.servName, q),
    );
    if (filter) conditions.push(filter);
  }
  if (input.purType) conditions.push(eq(salesPurchase.purType, input.purType));
  if (input.baseDate) {
    conditions.push(lte(salesPurchase.sdate, input.baseDate));
    conditions.push(gte(salesPurchase.edate, input.baseDate));
  }
  return conditions;
}

type TaxBillsFilterInput = z.infer<typeof listTaxBillsInput>;
function buildTaxBillsConditions(workspaceId: string, input: TaxBillsFilterInput) {
  const conditions = [eq(salesTaxBill.workspaceId, workspaceId)];
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(salesTaxBill.companyNm, q),
      ilike(salesTaxBill.legacyContNo, q),
      ilike(salesTaxBill.pjtNm, q),
    );
    if (filter) conditions.push(filter);
  }
  if (input.billType) conditions.push(eq(salesTaxBill.billType, input.billType));
  if (input.ym) conditions.push(eq(salesTaxBill.ym, input.ym));
  if (input.fromYmd) conditions.push(gte(salesTaxBill.postDate, input.fromYmd));
  if (input.toYmd) conditions.push(lte(salesTaxBill.postDate, input.toYmd));
  return conditions;
}

type MonthExpSgaFilterInput = z.infer<typeof listMonthExpSgaInput>;
function buildMonthExpSgaConditions(workspaceId: string, input: MonthExpSgaFilterInput) {
  const conditions = [eq(salesMonthExpSga.workspaceId, workspaceId)];
  if (input.ym && input.ym.length >= 6) {
    conditions.push(eq(salesMonthExpSga.yyyy, input.ym.slice(0, 4)));
    conditions.push(eq(salesMonthExpSga.mm, input.ym.slice(4, 6)));
  }
  if (input.costCd) conditions.push(ilike(salesMonthExpSga.costCd, `%${input.costCd}%`));
  return conditions;
}

type PlanDivCostsFilterInput = z.infer<typeof listPlanDivCostsInput>;
function buildPlanDivCostsConditions(workspaceId: string, input: PlanDivCostsFilterInput) {
  const conditions = [eq(salesPlanDivCost.workspaceId, workspaceId)];
  if (input.q) conditions.push(ilike(salesPlanDivCost.costCd, `%${input.q}%`));
  if (input.accountType) conditions.push(eq(salesPlanDivCost.accountType, input.accountType));
  if (input.year) conditions.push(like(salesPlanDivCost.ym, `${input.year}%`));
  return conditions;
}

export async function listPurchases(rawInput: unknown): Promise<ListResult<SalesPurchaseRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error };

  const input = listPurchasesInput.parse(rawInput);
  const conditions = buildPurchasesConditions(ctx.workspaceId, input);

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db
      .select({ purchase: salesPurchase, contract: { contNm: salesContract.contNm } })
      .from(salesPurchase)
      .leftJoin(
        salesContract,
        and(
          eq(salesContract.workspaceId, salesPurchase.workspaceId),
          eq(salesContract.legacyEnterCd, salesPurchase.legacyEnterCd),
          eq(salesContract.legacyContYear, salesPurchase.legacyContYear),
          eq(salesContract.legacyContNo, salesPurchase.legacyContNo),
        ),
      )
      .where(where)
      .orderBy(desc(salesPurchase.sdate), desc(salesPurchase.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesPurchase).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map((r) => serializePurchase(r.purchase, r.contract ?? undefined)),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function savePurchases(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = savePurchasesInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx.insert(salesPurchase).values(input.creates.map((c) => ({
          ...c,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId ?? undefined,
          updatedBy: ctx.userId ?? undefined,
        }))).returning({ id: salesPurchase.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.purchase.create", "sales_purchase", r.id)));
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx.update(salesPurchase).set({
          ...patch,
          updatedAt: new Date(),
          updatedBy: ctx.userId ?? undefined,
        }).where(and(eq(salesPurchase.id, id), eq(salesPurchase.workspaceId, ctx.workspaceId))).returning({ id: salesPurchase.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(auditValues(ctx, "sales.purchase.update", "sales_purchase", row.id, patch));
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx.delete(salesPurchase).where(and(
          eq(salesPurchase.workspaceId, ctx.workspaceId),
          inArray(salesPurchase.id, input.deletes),
        )).returning({ id: salesPurchase.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.purchase.delete", "sales_purchase", r.id)));
      }
    });
  } catch (error) {
    return { ok: false, created, updated, deleted, errors: [{ message: error instanceof Error ? error.message : "save failed" }] };
  }

  revalidatePath("/sales/purchases");
  return { ok: true, created, updated, deleted };
}

export async function listTaxBills(rawInput: unknown): Promise<ListResult<SalesTaxBillRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error };

  const input = listTaxBillsInput.parse(rawInput);
  const conditions = buildTaxBillsConditions(ctx.workspaceId, input);

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db
      .select({ taxBill: salesTaxBill, contract: { contNm: salesContract.contNm } })
      .from(salesTaxBill)
      .leftJoin(
        salesContract,
        and(
          eq(salesContract.workspaceId, salesTaxBill.workspaceId),
          eq(salesContract.legacyEnterCd, salesTaxBill.legacyEnterCd),
          eq(salesContract.legacyContNo, salesTaxBill.legacyContNo),
        ),
      )
      .where(where)
      .orderBy(desc(salesTaxBill.postDate), desc(salesTaxBill.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesTaxBill).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map((r) => serializeTaxBill(r.taxBill, r.contract ?? undefined)),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function saveTaxBills(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = saveTaxBillsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx.insert(salesTaxBill).values(input.creates.map((c) => ({
          ...c,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId ?? undefined,
          updatedBy: ctx.userId ?? undefined,
        }))).returning({ id: salesTaxBill.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.tax_bill.create", "sales_tax_bill", r.id)));
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx.update(salesTaxBill).set({
          ...patch,
          updatedAt: new Date(),
          updatedBy: ctx.userId ?? undefined,
        }).where(and(eq(salesTaxBill.id, id), eq(salesTaxBill.workspaceId, ctx.workspaceId))).returning({ id: salesTaxBill.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(auditValues(ctx, "sales.tax_bill.update", "sales_tax_bill", row.id, patch));
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx.delete(salesTaxBill).where(and(
          eq(salesTaxBill.workspaceId, ctx.workspaceId),
          inArray(salesTaxBill.id, input.deletes),
        )).returning({ id: salesTaxBill.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.tax_bill.delete", "sales_tax_bill", r.id)));
      }
    });
  } catch (error) {
    return { ok: false, created, updated, deleted, errors: [{ message: error instanceof Error ? error.message : "save failed" }] };
  }

  revalidatePath("/sales/tax-bills");
  return { ok: true, created, updated, deleted };
}

export async function listMonthExpSga(rawInput: unknown): Promise<ListResult<SalesMonthExpSgaRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error };

  const input = listMonthExpSgaInput.parse(rawInput);
  const conditions = buildMonthExpSgaConditions(ctx.workspaceId, input);

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(salesMonthExpSga).where(where).orderBy(desc(salesMonthExpSga.yyyy), desc(salesMonthExpSga.mm), salesMonthExpSga.costCd).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesMonthExpSga).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializeMonthExpSga),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function saveMonthExpSga(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = saveMonthExpSgaInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx.insert(salesMonthExpSga).values(input.creates.map((c) => ({
          ...c,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId ?? undefined,
          updatedBy: ctx.userId ?? undefined,
        }))).returning({ id: salesMonthExpSga.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.month_exp_sga.create", "sales_month_exp_sga", r.id)));
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx.update(salesMonthExpSga).set({
          ...patch,
          updatedAt: new Date(),
          updatedBy: ctx.userId ?? undefined,
        }).where(and(eq(salesMonthExpSga.id, id), eq(salesMonthExpSga.workspaceId, ctx.workspaceId))).returning({ id: salesMonthExpSga.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(auditValues(ctx, "sales.month_exp_sga.update", "sales_month_exp_sga", row.id, patch));
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx.delete(salesMonthExpSga).where(and(
          eq(salesMonthExpSga.workspaceId, ctx.workspaceId),
          inArray(salesMonthExpSga.id, input.deletes),
        )).returning({ id: salesMonthExpSga.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.month_exp_sga.delete", "sales_month_exp_sga", r.id)));
      }
    });
  } catch (error) {
    return { ok: false, created, updated, deleted, errors: [{ message: error instanceof Error ? error.message : "save failed" }] };
  }

  revalidatePath("/sales/month-exp-sga");
  return { ok: true, created, updated, deleted };
}

export async function listPlanDivCosts(rawInput: unknown): Promise<ListResult<SalesPlanDivCostRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error };

  const input = listPlanDivCostsInput.parse(rawInput);
  const conditions = buildPlanDivCostsConditions(ctx.workspaceId, input);

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(salesPlanDivCost).where(where).orderBy(salesPlanDivCost.costCd, salesPlanDivCost.accountType, salesPlanDivCost.ym).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesPlanDivCost).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializePlanDivCost),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function savePlanDivCosts(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = savePlanDivCostsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx.insert(salesPlanDivCost).values(input.creates.map((c) => ({
          ...c,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId ?? undefined,
          updatedBy: ctx.userId ?? undefined,
        }))).returning({ id: salesPlanDivCost.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.plan_div_cost.create", "sales_plan_div_cost", r.id)));
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx.update(salesPlanDivCost).set({
          ...patch,
          updatedAt: new Date(),
          updatedBy: ctx.userId ?? undefined,
        }).where(and(eq(salesPlanDivCost.id, id), eq(salesPlanDivCost.workspaceId, ctx.workspaceId))).returning({ id: salesPlanDivCost.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(auditValues(ctx, "sales.plan_div_cost.update", "sales_plan_div_cost", row.id, patch));
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx.delete(salesPlanDivCost).where(and(
          eq(salesPlanDivCost.workspaceId, ctx.workspaceId),
          inArray(salesPlanDivCost.id, input.deletes),
        )).returning({ id: salesPlanDivCost.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(rows.map((r) => auditValues(ctx, "sales.plan_div_cost.delete", "sales_plan_div_cost", r.id)));
      }
    });
  } catch (error) {
    return { ok: false, created, updated, deleted, errors: [{ message: error instanceof Error ? error.message : "save failed" }] };
  }

  revalidatePath("/sales/plan-div-costs");
  return { ok: true, created, updated, deleted };
}

/**
 * Caller contract: `rows` MUST already be guarded by `enforceExportLimit`
 * (i.e. queried with `.limit(EXPORT_ROW_LIMIT + 1)` and bounce rejected by
 * the caller). This helper builds the xlsx buffer, writes the audit row,
 * and returns the download envelope.
 *
 * `ctx` is passed in (already authenticated by the caller) so we don't
 * re-resolve the session for every export — the caller already needed it
 * to scope the DB query, so reuse it here.
 */
async function buildExportResult<T extends { id: string }>(
  ctx: { workspaceId: string; userId: string },
  filenamePrefix: string,
  sheetName: string,
  columns: ColumnDef<T>[],
  rows: T[],
  filters: Record<string, unknown>,
  resourceType: string,
) {
  const buf = await exportToExcel({
    rows: rows as unknown as Record<string, unknown>[],
    columns: columns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName,
  });

  await db.insert(auditLog).values(auditValues(ctx, `sales.${filenamePrefix}.export`, resourceType, null, { filters }));

  return {
    ok: true as const,
    filename: `${filenamePrefix}_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}

/**
 * Finance exports query the DB directly instead of going through the
 * paginated `listFoo()` siblings — that keeps the (LIMIT + 1) sentinel +
 * `enforceExportLimit()` pattern aligned with every other export.ts in
 * the codebase, and avoids tripping `pagingInput.limit.max(200)`.
 *
 * Filter logic is mirrored from each `listFoo()` body to stay in sync;
 * if you change a list filter, mirror it here too.
 */

const PURCHASES_EXPORT_COLUMNS: ColumnDef<SalesPurchaseRow>[] = [
  { key: "legacyContNo", label: "Contract No", type: "text" },
  { key: "contNm", label: "Contract", type: "text" },
  { key: "purNm", label: "Purchase", type: "text" },
  { key: "purType", label: "Type", type: "text" },
  { key: "amt", label: "Amount", type: "numeric" },
  { key: "subAmt", label: "Sub Amount", type: "numeric" },
  { key: "sdate", label: "Start", type: "text" },
  { key: "edate", label: "End", type: "text" },
  { key: "servName", label: "Service Name", type: "text" },
];

export async function exportPurchasesToExcel(rawFilters: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  // `limit: 200` is throwaway — required to satisfy the Zod cap, but the
  // actual DB query below uses EXPORT_ROW_LIMIT + 1.
  const input = listPurchasesInput.parse({ ...(rawFilters as Record<string, unknown>), page: 1, limit: 200 });
  const conditions = buildPurchasesConditions(ctx.workspaceId, input);

  const rawRows = await db
    .select({ purchase: salesPurchase, contract: { contNm: salesContract.contNm } })
    .from(salesPurchase)
    .leftJoin(
      salesContract,
      and(
        eq(salesContract.workspaceId, salesPurchase.workspaceId),
        eq(salesContract.legacyEnterCd, salesPurchase.legacyEnterCd),
        eq(salesContract.legacyContYear, salesPurchase.legacyContYear),
        eq(salesContract.legacyContNo, salesPurchase.legacyContNo),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(salesPurchase.sdate), desc(salesPurchase.createdAt))
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rawRows);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const exportData = guard.rows.map((r) => serializePurchase(r.purchase, r.contract ?? undefined));

  return buildExportResult(
    ctx,
    "purchases",
    "Purchases",
    PURCHASES_EXPORT_COLUMNS,
    exportData,
    rawFilters as Record<string, unknown>,
    "sales_purchase",
  );
}

const TAX_BILLS_EXPORT_COLUMNS: ColumnDef<SalesTaxBillRow>[] = [
  { key: "legacyContNo", label: "Contract No", type: "text" },
  { key: "companyNm", label: "Company", type: "text" },
  { key: "ym", label: "YM", type: "text" },
  { key: "billType", label: "Bill Type", type: "text" },
  { key: "orderDivCd", label: "Order Div", type: "text" },
  { key: "amt", label: "Amount", type: "numeric" },
  { key: "vatAmt", label: "VAT", type: "numeric" },
  { key: "postDate", label: "Post Date", type: "text" },
  { key: "slipResultYn", label: "Slip Result", type: "text" },
];

export async function exportTaxBillsToExcel(rawFilters: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = listTaxBillsInput.parse({ ...(rawFilters as Record<string, unknown>), page: 1, limit: 200 });
  const conditions = buildTaxBillsConditions(ctx.workspaceId, input);

  const rawRows = await db
    .select({ taxBill: salesTaxBill, contract: { contNm: salesContract.contNm } })
    .from(salesTaxBill)
    .leftJoin(
      salesContract,
      and(
        eq(salesContract.workspaceId, salesTaxBill.workspaceId),
        eq(salesContract.legacyEnterCd, salesTaxBill.legacyEnterCd),
        eq(salesContract.legacyContNo, salesTaxBill.legacyContNo),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(salesTaxBill.postDate), desc(salesTaxBill.createdAt))
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rawRows);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const exportData = guard.rows.map((r) => serializeTaxBill(r.taxBill, r.contract ?? undefined));

  return buildExportResult(
    ctx,
    "tax_bills",
    "Tax Bills",
    TAX_BILLS_EXPORT_COLUMNS,
    exportData,
    rawFilters as Record<string, unknown>,
    "sales_tax_bill",
  );
}

const MONTH_EXP_SGA_EXPORT_COLUMNS: ColumnDef<SalesMonthExpSgaRow>[] = [
  { key: "yyyy", label: "Year", type: "text" },
  { key: "mm", label: "Month", type: "text" },
  { key: "costCd", label: "Cost", type: "text" },
  { key: "expAmt", label: "Expense", type: "numeric" },
  { key: "sgaAmt", label: "SGA", type: "numeric" },
  { key: "waers", label: "Currency", type: "text" },
];

export async function exportMonthExpSgaToExcel(rawFilters: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = listMonthExpSgaInput.parse({ ...(rawFilters as Record<string, unknown>), page: 1, limit: 200 });
  const conditions = buildMonthExpSgaConditions(ctx.workspaceId, input);

  const rawRows = await db
    .select()
    .from(salesMonthExpSga)
    .where(and(...conditions))
    .orderBy(desc(salesMonthExpSga.yyyy), desc(salesMonthExpSga.mm), salesMonthExpSga.costCd)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rawRows);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const exportData = guard.rows.map(serializeMonthExpSga);

  return buildExportResult(
    ctx,
    "month_exp_sga",
    "Month Exp SGA",
    MONTH_EXP_SGA_EXPORT_COLUMNS,
    exportData,
    rawFilters as Record<string, unknown>,
    "sales_month_exp_sga",
  );
}

const PLAN_DIV_COSTS_EXPORT_COLUMNS: ColumnDef<SalesPlanDivCostRow>[] = [
  { key: "costCd", label: "Cost", type: "text" },
  { key: "accountType", label: "Account Type", type: "text" },
  { key: "ym", label: "YM", type: "text" },
  { key: "planAmt", label: "Plan", type: "numeric" },
  { key: "prdtAmt", label: "Product", type: "numeric" },
  { key: "performAmt", label: "Perform", type: "numeric" },
  { key: "note", label: "Note", type: "text" },
];

export async function exportPlanDivCostsToExcel(rawFilters: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = listPlanDivCostsInput.parse({ ...(rawFilters as Record<string, unknown>), page: 1, limit: 200 });
  const conditions = buildPlanDivCostsConditions(ctx.workspaceId, input);

  const rawRows = await db
    .select()
    .from(salesPlanDivCost)
    .where(and(...conditions))
    .orderBy(salesPlanDivCost.costCd, salesPlanDivCost.accountType, salesPlanDivCost.ym)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rawRows);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const exportData = guard.rows.map(serializePlanDivCost);

  return buildExportResult(
    ctx,
    "plan_div_costs",
    "Plan Div Costs",
    PLAN_DIV_COSTS_EXPORT_COLUMNS,
    exportData,
    rawFilters as Record<string, unknown>,
    "sales_plan_div_cost",
  );
}

// ============================================================================
// Sub-row actions: sales_purchase_project (children of sales_purchase)
// ============================================================================

function serializePurchaseProject(
  r: typeof salesPurchaseProject.$inferSelect,
): SalesPurchaseProjectRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    purchaseId: r.purchaseId ?? null,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    legacySeq: r.legacySeq ?? null,
    legacyPurSeq: r.legacyPurSeq ?? null,
    subContNo: r.subContNo ?? null,
    pjtCode: r.pjtCode ?? null,
    pjtNm: r.pjtNm ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listPurchaseProjects(
  rawInput: unknown,
): Promise<ListResult<SalesPurchaseProjectRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 200, error: ctx.error };

  const input = listPurchaseProjectsInput.parse(rawInput);

  // Parent ownership check — purchaseId must belong to this workspace.
  const [parent] = await db
    .select({ id: salesPurchase.id })
    .from(salesPurchase)
    .where(and(eq(salesPurchase.id, input.purchaseId), eq(salesPurchase.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!parent) {
    return { ok: false, rows: [], total: 0, page: 1, limit: 200, error: "Forbidden" };
  }

  const where = and(
    eq(salesPurchaseProject.workspaceId, ctx.workspaceId),
    eq(salesPurchaseProject.purchaseId, input.purchaseId),
  );
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesPurchaseProject)
      .where(where)
      .orderBy(salesPurchaseProject.subContNo, salesPurchaseProject.pjtCode, salesPurchaseProject.createdAt),
    db.select({ count: count() }).from(salesPurchaseProject).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializePurchaseProject),
    total: Number(countRows[0]?.count ?? 0),
    page: 1,
    limit: rows.length,
  };
}

export async function savePurchaseProjects(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = savePurchaseProjectsInput.parse(rawInput);

  // Parent ownership check — purchaseId must belong to this workspace.
  const [parent] = await db
    .select({
      id: salesPurchase.id,
      legacyEnterCd: salesPurchase.legacyEnterCd,
      legacyContYear: salesPurchase.legacyContYear,
      legacyContNo: salesPurchase.legacyContNo,
      legacySeq: salesPurchase.legacySeq,
      legacyPurSeq: salesPurchase.legacyPurSeq,
    })
    .from(salesPurchase)
    .where(and(eq(salesPurchase.id, input.purchaseId), eq(salesPurchase.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!parent) {
    return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: "Forbidden" }] };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx
          .insert(salesPurchaseProject)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              purchaseId: input.purchaseId,
              // Pre-fill composite legacy keys from parent unless explicitly set.
              legacyEnterCd: c.legacyEnterCd ?? parent.legacyEnterCd ?? undefined,
              legacyContYear: c.legacyContYear ?? parent.legacyContYear ?? undefined,
              legacyContNo: c.legacyContNo ?? parent.legacyContNo ?? undefined,
              legacySeq: c.legacySeq ?? parent.legacySeq ?? undefined,
              legacyPurSeq: c.legacyPurSeq ?? parent.legacyPurSeq ?? undefined,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesPurchaseProject.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(
          rows.map((r) =>
            auditValues(ctx, "sales.purchase_project.create", "sales_purchase_project", r.id, {
              purchaseId: input.purchaseId,
            }),
          ),
        );
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx
          .update(salesPurchaseProject)
          .set({ ...patch, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(
            and(
              eq(salesPurchaseProject.id, id),
              eq(salesPurchaseProject.workspaceId, ctx.workspaceId),
              eq(salesPurchaseProject.purchaseId, input.purchaseId),
            ),
          )
          .returning({ id: salesPurchaseProject.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(
            auditValues(ctx, "sales.purchase_project.update", "sales_purchase_project", row.id, {
              purchaseId: input.purchaseId,
              ...patch,
            }),
          );
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx
          .delete(salesPurchaseProject)
          .where(
            and(
              eq(salesPurchaseProject.workspaceId, ctx.workspaceId),
              eq(salesPurchaseProject.purchaseId, input.purchaseId),
              inArray(salesPurchaseProject.id, input.deletes),
            ),
          )
          .returning({ id: salesPurchaseProject.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(
          rows.map((r) =>
            auditValues(ctx, "sales.purchase_project.delete", "sales_purchase_project", r.id, {
              purchaseId: input.purchaseId,
            }),
          ),
        );
      }
    });
  } catch (error) {
    return {
      ok: false,
      created,
      updated,
      deleted,
      errors: [{ message: error instanceof Error ? error.message : "save failed" }],
    };
  }

  revalidatePath("/sales/purchases");
  return { ok: true, created, updated, deleted };
}

// ============================================================================
// Sub-row actions: sales_plan_div_cost_detail (children of sales_plan_div_cost)
// ============================================================================

function serializePlanDivCostDetail(
  r: typeof salesPlanDivCostDetail.$inferSelect,
): SalesPlanDivCostDetailRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    planDivCostId: r.planDivCostId ?? null,
    legacyEnterCd: r.legacyEnterCd ?? null,
    costCd: r.costCd ?? null,
    accountType: r.accountType ?? null,
    ym: r.ym ?? null,
    subCostCd: r.subCostCd ?? null,
    planRate: r.planRate ?? null,
    prdtRate: r.prdtRate ?? null,
    performRate: r.performRate ?? null,
    useYn: r.useYn ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listPlanDivCostDetails(
  rawInput: unknown,
): Promise<ListResult<SalesPlanDivCostDetailRow>> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, rows: [], total: 0, page: 1, limit: 200, error: ctx.error };

  const input = listPlanDivCostDetailsInput.parse(rawInput);

  const [parent] = await db
    .select({ id: salesPlanDivCost.id })
    .from(salesPlanDivCost)
    .where(
      and(
        eq(salesPlanDivCost.id, input.planDivCostId),
        eq(salesPlanDivCost.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!parent) {
    return { ok: false, rows: [], total: 0, page: 1, limit: 200, error: "Forbidden" };
  }

  const where = and(
    eq(salesPlanDivCostDetail.workspaceId, ctx.workspaceId),
    eq(salesPlanDivCostDetail.planDivCostId, input.planDivCostId),
  );
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesPlanDivCostDetail)
      .where(where)
      .orderBy(salesPlanDivCostDetail.subCostCd, salesPlanDivCostDetail.createdAt),
    db.select({ count: count() }).from(salesPlanDivCostDetail).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializePlanDivCostDetail),
    total: Number(countRows[0]?.count ?? 0),
    page: 1,
    limit: rows.length,
  };
}

export async function savePlanDivCostDetails(rawInput: unknown): Promise<SaveResult> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: ctx.error }] };

  const input = savePlanDivCostDetailsInput.parse(rawInput);

  const [parent] = await db
    .select({
      id: salesPlanDivCost.id,
      legacyEnterCd: salesPlanDivCost.legacyEnterCd,
      costCd: salesPlanDivCost.costCd,
      accountType: salesPlanDivCost.accountType,
      ym: salesPlanDivCost.ym,
    })
    .from(salesPlanDivCost)
    .where(
      and(
        eq(salesPlanDivCost.id, input.planDivCostId),
        eq(salesPlanDivCost.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!parent) {
    return { ok: false, created: [], updated: [], deleted: [], errors: [{ message: "Forbidden" }] };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const rows = await tx
          .insert(salesPlanDivCostDetail)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              planDivCostId: input.planDivCostId,
              // Pre-fill composite legacy keys from parent unless explicitly set.
              legacyEnterCd: c.legacyEnterCd ?? parent.legacyEnterCd ?? undefined,
              costCd: c.costCd ?? parent.costCd ?? undefined,
              accountType: c.accountType ?? parent.accountType ?? undefined,
              ym: c.ym ?? parent.ym ?? undefined,
              // Legacy default — useYn = 'Y' when client omits.
              useYn: c.useYn ?? "Y",
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesPlanDivCostDetail.id });
        created.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(
          rows.map((r) =>
            auditValues(ctx, "sales.plan_div_cost_detail.create", "sales_plan_div_cost_detail", r.id, {
              planDivCostId: input.planDivCostId,
            }),
          ),
        );
      }
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx
          .update(salesPlanDivCostDetail)
          .set({ ...patch, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(
            and(
              eq(salesPlanDivCostDetail.id, id),
              eq(salesPlanDivCostDetail.workspaceId, ctx.workspaceId),
              eq(salesPlanDivCostDetail.planDivCostId, input.planDivCostId),
            ),
          )
          .returning({ id: salesPlanDivCostDetail.id });
        if (row) {
          updated.push(row.id);
          await tx.insert(auditLog).values(
            auditValues(ctx, "sales.plan_div_cost_detail.update", "sales_plan_div_cost_detail", row.id, {
              planDivCostId: input.planDivCostId,
              ...patch,
            }),
          );
        }
      }
      if (input.deletes.length > 0) {
        const rows = await tx
          .delete(salesPlanDivCostDetail)
          .where(
            and(
              eq(salesPlanDivCostDetail.workspaceId, ctx.workspaceId),
              eq(salesPlanDivCostDetail.planDivCostId, input.planDivCostId),
              inArray(salesPlanDivCostDetail.id, input.deletes),
            ),
          )
          .returning({ id: salesPlanDivCostDetail.id });
        deleted.push(...rows.map((r) => r.id));
        await tx.insert(auditLog).values(
          rows.map((r) =>
            auditValues(ctx, "sales.plan_div_cost_detail.delete", "sales_plan_div_cost_detail", r.id, {
              planDivCostId: input.planDivCostId,
            }),
          ),
        );
      }
    });
  } catch (error) {
    return {
      ok: false,
      created,
      updated,
      deleted,
      errors: [{ message: error instanceof Error ? error.message : "save failed" }],
    };
  }

  revalidatePath("/sales/plan-div-costs");
  return { ok: true, created, updated, deleted };
}
