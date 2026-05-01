"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, ilike, inArray, max } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomerContact, salesCustomer, salesCustomerContactMemo, user, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCustomerContactsInput,
  listCustomerContactsOutput,
  saveCustomerContactsInput,
  saveCustomerContactsOutput,
} from "@jarvis/shared/validation/sales/customer-contact";
import {
  customerContactMemoListInput, customerContactMemoListOutput,
  customerContactMemoCreateInput, customerContactMemoCreateOutput,
  customerContactMemoDeleteInput, customerContactMemoDeleteOutput,
  customerContactTabCountsInput, customerContactTabCountsOutput,
} from "@jarvis/shared/validation/sales/customer-contact-memo";
import { buildMemoTree, getContactTabCounts as queryContactTabCounts } from "@/lib/queries/sales-tabs";
import type { z } from "zod";

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
  };
}

export async function listCustomerContacts(rawInput: z.input<typeof listCustomerContactsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listCustomerContactsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesCustomerContact.workspaceId, ctx.workspaceId)];
  if (input.custMcd) conditions.push(ilike(salesCustomerContact.custMcd, `%${input.custMcd}%`));
  if (input.custName) conditions.push(ilike(salesCustomerContact.custName, `%${input.custName}%`));
  if (input.customerId) conditions.push(eq(salesCustomerContact.customerId, input.customerId));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: salesCustomerContact.id,
        custMcd: salesCustomerContact.custMcd,
        customerId: salesCustomerContact.customerId,
        custName: salesCustomerContact.custName,
        jikweeNm: salesCustomerContact.jikweeNm,
        orgNm: salesCustomerContact.orgNm,
        telNo: salesCustomerContact.telNo,
        hpNo: salesCustomerContact.hpNo,
        email: salesCustomerContact.email,
        statusYn: salesCustomerContact.statusYn,
        sabun: salesCustomerContact.sabun,
        createdAt: salesCustomerContact.createdAt,
        // JOIN salesCustomer.custNm — read-only display column for grid (legacy bizActCustomerMgr.jsp:207).
        custNm: salesCustomer.custNm,
      })
      .from(salesCustomerContact)
      .leftJoin(salesCustomer, eq(salesCustomer.id, salesCustomerContact.customerId))
      .where(where)
      .orderBy(salesCustomerContact.custMcd)
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesCustomerContact).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  // Batch-fetch tab counts for all rows on this page (N+1 accepted per plan §14.2;
  // LATERAL JOIN optimisation deferred to follow-up).
  const contactIds = rows.map((r) => r.id);
  const countsMap =
    contactIds.length > 0
      ? new Map(
          await Promise.all(
            contactIds.map(
              async (id) =>
                [id, await queryContactTabCounts(ctx.workspaceId, id)] as const,
            ),
          ),
        )
      : new Map<string, Awaited<ReturnType<typeof queryContactTabCounts>>>();

  return listCustomerContactsOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      custMcd: r.custMcd,
      customerId: r.customerId ?? null,
      custName: r.custName ?? null,
      jikweeNm: r.jikweeNm ?? null,
      orgNm: r.orgNm ?? null,
      telNo: r.telNo ?? null,
      hpNo: r.hpNo ?? null,
      email: r.email ?? null,
      statusYn: r.statusYn ?? null,
      sabun: r.sabun ?? null,
      custNm: r.custNm ?? null,
      createdAt: r.createdAt.toISOString(),
      counts: countsMap.get(r.id)
        ? {
            custCompany: countsMap.get(r.id)!.custCompanyCnt,
            op: countsMap.get(r.id)!.opCnt,
            act: countsMap.get(r.id)!.actCnt,
            comt: countsMap.get(r.id)!.comtCnt,
          }
        : null,
    })),
    total,
  });
}

export async function saveCustomerContacts(rawInput: z.input<typeof saveCustomerContactsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = saveCustomerContactsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of input.creates) {
        // custNm + createdAt are read-only display fields (custNm via JOIN, createdAt via defaultNow) — strip from insert.
        const { custNm: _omitCustNm, createdAt: _omitCreatedAt, ...createPayload } = c;
        void _omitCustNm;
        void _omitCreatedAt;
        await tx.insert(salesCustomerContact).values({ ...createPayload, workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined });
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.customer_contact.create", resourceType: "sales_customer_contact", resourceId: c.id, details: { custMcd: c.custMcd } as Record<string, unknown>, success: true });
        created.push(c.id);
      }
      for (const u of input.updates) {
        // custNm + createdAt are read-only display fields — strip from update patch.
        const { custNm: _omitCustNm, createdAt: _omitCreatedAt, ...updatablePatch } = u.patch;
        void _omitCustNm;
        void _omitCreatedAt;
        await tx.update(salesCustomerContact).set({ ...updatablePatch, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined }).where(and(eq(salesCustomerContact.id, u.id), eq(salesCustomerContact.workspaceId, ctx.workspaceId)));
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.customer_contact.update", resourceType: "sales_customer_contact", resourceId: u.id, details: updatablePatch as Record<string, unknown>, success: true });
        updated.push(u.id);
      }
      if (input.deletes.length > 0) {
        await tx.delete(salesCustomerContact).where(and(inArray(salesCustomerContact.id, input.deletes), eq(salesCustomerContact.workspaceId, ctx.workspaceId)));
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.customer_contact.delete", resourceType: "sales_customer_contact", resourceId: id, details: {} as Record<string, unknown>, success: true });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveCustomerContactsOutput.parse({ ok: errors.length === 0, created, updated, deleted, errors: errors.length > 0 ? errors : undefined });
}

// ────────────────────────────────────────────────────────────────────────────
// Tab counts + memo CRUD (Task 5)
// ────────────────────────────────────────────────────────────────────────────

export async function getContactTabCounts(rawInput: z.input<typeof customerContactTabCountsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const { contactId } = customerContactTabCountsInput.parse(rawInput);
  const counts = await queryContactTabCounts(ctx.workspaceId, contactId);
  return { ok: true as const, ...customerContactTabCountsOutput.parse(counts) };
}

export async function listContactMemos(rawInput: z.input<typeof customerContactMemoListInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };
  const { contactId } = customerContactMemoListInput.parse(rawInput);

  const rows = await db
    .select({
      comtSeq: salesCustomerContactMemo.comtSeq,
      priorComtSeq: salesCustomerContactMemo.priorComtSeq,
      memo: salesCustomerContactMemo.memo,
      authorName: user.name,
      insdate: salesCustomerContactMemo.createdAt,
      createdBy: salesCustomerContactMemo.createdBy,
    })
    .from(salesCustomerContactMemo)
    .leftJoin(user, eq(user.id, salesCustomerContactMemo.createdBy))
    .where(and(
      eq(salesCustomerContactMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerContactMemo.contactId, contactId),
    ))
    .orderBy(salesCustomerContactMemo.comtSeq);

  const tree = buildMemoTree(
    rows.map((r) => ({
      comtSeq: r.comtSeq,
      priorComtSeq: r.priorComtSeq,
      memo: r.memo,
      authorName: r.authorName,
      insdate: r.insdate.toISOString().slice(0, 16).replace("T", " "),
      createdBy: r.createdBy,
    })),
    ctx.userId ?? null,
  );

  return customerContactMemoListOutput.parse({ rows: tree });
}

export async function createContactMemo(rawInput: z.input<typeof customerContactMemoCreateInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerContactMemoCreateOutput.parse({ ok: false, comtSeq: null });
  const { contactId, priorComtSeq, memo } = customerContactMemoCreateInput.parse(rawInput);

  const nextSeq = await db.transaction(async (tx) => {
    const maxRow = await tx
      .select({ m: max(salesCustomerContactMemo.comtSeq) })
      .from(salesCustomerContactMemo)
      .where(and(
        eq(salesCustomerContactMemo.workspaceId, ctx.workspaceId),
        eq(salesCustomerContactMemo.contactId, contactId),
      ));
    const seq = (maxRow[0]?.m ?? 0) + 1;

    await tx.insert(salesCustomerContactMemo).values({
      workspaceId: ctx.workspaceId,
      contactId,
      comtSeq: seq,
      priorComtSeq: priorComtSeq === 0 ? null : priorComtSeq,
      memo,
      createdBy: ctx.userId ?? undefined,
    });
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer_contact.memo.create",
      resourceType: "sales_customer_contact_memo",
      resourceId: contactId,
      details: { comtSeq: seq, priorComtSeq } as Record<string, unknown>,
      success: true,
    });
    return seq;
  });

  return customerContactMemoCreateOutput.parse({ ok: true, comtSeq: nextSeq });
}

export async function deleteContactMemo(rawInput: z.input<typeof customerContactMemoDeleteInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerContactMemoDeleteOutput.parse({ ok: false });
  const { contactId, comtSeq } = customerContactMemoDeleteInput.parse(rawInput);

  const sessionId = await resolveSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  const adminBypass = session ? isAdmin(session) : false;

  await db.transaction(async (tx) => {
    const conds = [
      eq(salesCustomerContactMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerContactMemo.contactId, contactId),
      eq(salesCustomerContactMemo.comtSeq, comtSeq),
    ];
    if (!adminBypass && ctx.userId) conds.push(eq(salesCustomerContactMemo.createdBy, ctx.userId));
    await tx.delete(salesCustomerContactMemo).where(and(...conds));

    // Cascade: delete replies of this master (priorComtSeq = comtSeq)
    await tx.delete(salesCustomerContactMemo).where(and(
      eq(salesCustomerContactMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerContactMemo.contactId, contactId),
      eq(salesCustomerContactMemo.priorComtSeq, comtSeq),
    ));

    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer_contact.memo.delete",
      resourceType: "sales_customer_contact_memo",
      resourceId: contactId,
      details: { comtSeq } as Record<string, unknown>,
      success: true,
    });
  });

  return customerContactMemoDeleteOutput.parse({ ok: true });
}
