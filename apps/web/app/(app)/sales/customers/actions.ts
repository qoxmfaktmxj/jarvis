"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, gte, ilike, inArray, lte, max } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomer, salesCustomerMemo, salesCustomerCharger, user, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCustomersInput,
  listCustomersOutput,
  saveCustomersInput,
  saveCustomersOutput,
} from "@jarvis/shared/validation/sales/customer";
import {
  getCustomerInput,
  getCustomerOutput,
} from "@jarvis/shared/validation/sales/customer-detail";
import {
  customerMemoListInput, customerMemoListOutput,
  customerMemoCreateInput, customerMemoCreateOutput,
  customerMemoDeleteInput, customerMemoDeleteOutput,
  customerTabCountsInput, customerTabCountsOutput,
} from "@jarvis/shared/validation/sales/customer-memo";
import { buildMemoTree, getCustomerTabCounts as queryCustomerTabCounts } from "@/lib/queries/sales-tabs";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (same pattern as admin/companies/actions.ts)
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
// listCustomers
// ---------------------------------------------------------------------------

export async function listCustomers(rawInput: z.input<typeof listCustomersInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listCustomersInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesCustomer.workspaceId, ctx.workspaceId)];
  if (input.q) {
    conditions.push(ilike(salesCustomer.custNm, `%${input.q}%`));
  }
  if (input.custCd) conditions.push(ilike(salesCustomer.custCd, `%${input.custCd}%`));
  if (input.custNm) conditions.push(ilike(salesCustomer.custNm, `%${input.custNm}%`));
  if (input.custKindCd) conditions.push(eq(salesCustomer.custKindCd, input.custKindCd));
  if (input.custDivCd) conditions.push(eq(salesCustomer.custDivCd, input.custDivCd));
  // chargerNm: filter by related charger's name via subquery on sales_customer_charger
  if (input.chargerNm) {
    const chargerSubquery = db
      .selectDistinct({ customerId: salesCustomerCharger.customerId })
      .from(salesCustomerCharger)
      .where(
        and(
          eq(salesCustomerCharger.workspaceId, ctx.workspaceId),
          ilike(salesCustomerCharger.name, `%${input.chargerNm}%`),
        ),
      );
    conditions.push(inArray(salesCustomer.id, chargerSubquery));
  }
  // searchYmd date range: filter on salesCustomer.createdAt::date
  // Use explicit KST offset to avoid UTC midnight being 09:00 KST, which would
  // exclude records created between 00:00–08:59 KST on the start date.
  if (input.searchYmdFrom) {
    conditions.push(gte(salesCustomer.createdAt, new Date(input.searchYmdFrom + "T00:00:00+09:00")));
  }
  if (input.searchYmdTo) {
    // Include the full end date day by using start of next day
    const toDate = new Date(input.searchYmdTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(salesCustomer.createdAt, toDate));
  }

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesCustomer)
      .where(where)
      .orderBy(salesCustomer.custCd)
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesCustomer).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  // Batch-fetch tab counts for all rows on this page (N+1 accepted per plan §14.2;
  // LATERAL JOIN optimisation deferred to follow-up).
  const customerIds = rows.map((r) => r.id);
  const countsMap =
    customerIds.length > 0
      ? new Map(
          await Promise.all(
            customerIds.map(
              async (id) =>
                [id, await queryCustomerTabCounts(ctx.workspaceId, id)] as const,
            ),
          ),
        )
      : new Map<string, Awaited<ReturnType<typeof queryCustomerTabCounts>>>();

  return listCustomersOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      custCd: r.custCd,
      custNm: r.custNm,
      custKindCd: r.custKindCd ?? null,
      custDivCd: r.custDivCd ?? null,
      exchangeTypeCd: r.exchangeTypeCd ?? null,
      custSourceCd: r.custSourceCd ?? null,
      custImprCd: r.custImprCd ?? null,
      buyInfoCd: r.buyInfoCd ?? null,
      buyInfoDtCd: r.buyInfoDtCd ?? null,
      ceoNm: r.ceoNm ?? null,
      telNo: r.telNo ?? null,
      businessNo: r.businessNo ?? null,
      faxNo: r.faxNo ?? null,
      businessKind: r.businessKind ?? null,
      homepage: r.homepage ?? null,
      addrNo: r.addrNo ?? null,
      addr1: r.addr1 ?? null,
      addr2: r.addr2 ?? null,
      createdAt: r.createdAt.toISOString(),
      counts: countsMap.get(r.id)
        ? {
            customer: countsMap.get(r.id)!.customerCnt,
            op: countsMap.get(r.id)!.opCnt,
            act: countsMap.get(r.id)!.actCnt,
            comt: countsMap.get(r.id)!.comtCnt,
          }
        : null,
    })),
    total,
  });
}

// ---------------------------------------------------------------------------
// saveCustomers
// ---------------------------------------------------------------------------

export async function saveCustomers(rawInput: z.input<typeof saveCustomersInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = saveCustomersInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        // createdAt is read-only — DB defaultNow handles insert; strip from client payload.
        const { createdAt: _omitCreatedAt, ...createPayload } = c;
        void _omitCreatedAt;
        await tx.insert(salesCustomer).values({
          ...createPayload,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId ?? undefined,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.customer.create",
          resourceType: "sales_customer",
          resourceId: c.id,
          details: { custCd: c.custCd } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // createdAt is read-only — strip from update patch.
        const { createdAt: _omitCreatedAt, ...updatablePatch } = u.patch;
        void _omitCreatedAt;
        await tx
          .update(salesCustomer)
          .set({ ...updatablePatch, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(
            and(
              eq(salesCustomer.id, u.id),
              eq(salesCustomer.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.customer.update",
          resourceType: "sales_customer",
          resourceId: u.id,
          details: updatablePatch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        await tx.delete(salesCustomer).where(
          and(
            inArray(salesCustomer.id, input.deletes),
            eq(salesCustomer.workspaceId, ctx.workspaceId),
          ),
        );
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.customer.delete",
            resourceType: "sales_customer",
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

  return saveCustomersOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Tab counts + memo CRUD (Task 5)
// ────────────────────────────────────────────────────────────────────────────

export async function getCustomerTabCounts(rawInput: z.input<typeof customerTabCountsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const { customerId } = customerTabCountsInput.parse(rawInput);
  const counts = await queryCustomerTabCounts(ctx.workspaceId, customerId);
  return { ok: true as const, ...customerTabCountsOutput.parse(counts) };
}

export async function listCustomerMemos(rawInput: z.input<typeof customerMemoListInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };
  const { customerId } = customerMemoListInput.parse(rawInput);

  const rows = await db
    .select({
      comtSeq: salesCustomerMemo.comtSeq,
      priorComtSeq: salesCustomerMemo.priorComtSeq,
      memo: salesCustomerMemo.memo,
      authorName: user.name,
      insdate: salesCustomerMemo.createdAt,
      createdBy: salesCustomerMemo.createdBy,
    })
    .from(salesCustomerMemo)
    .leftJoin(user, eq(user.id, salesCustomerMemo.createdBy))
    .where(and(
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
    ))
    .orderBy(salesCustomerMemo.comtSeq);

  const tree = buildMemoTree(
    rows.map((r) => ({
      comtSeq: r.comtSeq,
      priorComtSeq: r.priorComtSeq,
      memo: r.memo ?? "",
      authorName: r.authorName,
      insdate: r.insdate.toISOString().slice(0, 16).replace("T", " "),
      createdBy: r.createdBy,
    })),
    ctx.userId ?? null,
  );

  return customerMemoListOutput.parse({ rows: tree });
}

export async function createCustomerMemo(rawInput: z.input<typeof customerMemoCreateInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerMemoCreateOutput.parse({ ok: false, comtSeq: null });
  const { customerId, priorComtSeq, memo } = customerMemoCreateInput.parse(rawInput);

  const nextSeq = await db.transaction(async (tx) => {
    const maxRow = await tx
      .select({ m: max(salesCustomerMemo.comtSeq) })
      .from(salesCustomerMemo)
      .where(and(
        eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
        eq(salesCustomerMemo.customerId, customerId),
      ));
    const seq = (maxRow[0]?.m ?? 0) + 1;

    await tx.insert(salesCustomerMemo).values({
      workspaceId: ctx.workspaceId,
      customerId,
      comtSeq: seq,
      priorComtSeq: priorComtSeq === 0 ? null : priorComtSeq,
      memo,
      createdBy: ctx.userId ?? undefined,
    });
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer.memo.create",
      resourceType: "sales_customer_memo",
      resourceId: customerId,
      details: { comtSeq: seq, priorComtSeq } as Record<string, unknown>,
      success: true,
    });
    return seq;
  });

  return customerMemoCreateOutput.parse({ ok: true, comtSeq: nextSeq });
}

export async function deleteCustomerMemo(rawInput: z.input<typeof customerMemoDeleteInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerMemoDeleteOutput.parse({ ok: false });
  const { customerId, comtSeq } = customerMemoDeleteInput.parse(rawInput);

  const sessionId = await resolveSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  const adminBypass = session ? isAdmin(session) : false;

  await db.transaction(async (tx) => {
    const conds = [
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
      eq(salesCustomerMemo.comtSeq, comtSeq),
    ];
    if (!adminBypass && ctx.userId) conds.push(eq(salesCustomerMemo.createdBy, ctx.userId));
    await tx.delete(salesCustomerMemo).where(and(...conds));

    // Cascade: delete replies of this master (priorComtSeq = comtSeq)
    await tx.delete(salesCustomerMemo).where(and(
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
      eq(salesCustomerMemo.priorComtSeq, comtSeq),
    ));

    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer.memo.delete",
      resourceType: "sales_customer_memo",
      resourceId: customerId,
      details: { comtSeq } as Record<string, unknown>,
      success: true,
    });
  });

  return customerMemoDeleteOutput.parse({ ok: true });
}

// ────────────────────────────────────────────────────────────────────────────
// getCustomer — single-record fetch for master-detail edit (Task 13)
// ────────────────────────────────────────────────────────────────────────────

export async function getCustomer(rawInput: z.input<typeof getCustomerInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, customer: null };

  const { id } = getCustomerInput.parse(rawInput);

  const rows = await db
    .select({
      id: salesCustomer.id,
      custCd: salesCustomer.custCd,
      custNm: salesCustomer.custNm,
      custKindCd: salesCustomer.custKindCd,
      custDivCd: salesCustomer.custDivCd,
      ceoNm: salesCustomer.ceoNm,
      telNo: salesCustomer.telNo,
      businessNo: salesCustomer.businessNo,
      homepage: salesCustomer.homepage,
      addrNo: salesCustomer.addrNo,
      addr1: salesCustomer.addr1,
      addr2: salesCustomer.addr2,
    })
    .from(salesCustomer)
    .where(and(eq(salesCustomer.id, id), eq(salesCustomer.workspaceId, ctx.workspaceId)))
    .limit(1);

  const row = rows[0] ?? null;

  return {
    ok: true as const,
    ...getCustomerOutput.parse({
      customer: row
        ? {
            id: row.id,
            custCd: row.custCd,
            custNm: row.custNm,
            custKindCd: row.custKindCd ?? null,
            custDivCd: row.custDivCd ?? null,
            ceoNm: row.ceoNm ?? null,
            telNo: row.telNo ?? null,
            businessNo: row.businessNo ?? null,
            homepage: row.homepage ?? null,
            addrNo: row.addrNo ?? null,
            addr1: row.addr1 ?? null,
            addr2: row.addr2 ?? null,
          }
        : null,
    }),
  };
}
