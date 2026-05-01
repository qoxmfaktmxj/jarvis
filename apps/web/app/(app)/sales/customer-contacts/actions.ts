"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomerContact, salesCustomer, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCustomerContactsInput,
  listCustomerContactsOutput,
  saveCustomerContactsInput,
  saveCustomerContactsOutput,
} from "@jarvis/shared/validation/sales/customer-contact";
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
  // custName covers both direct "담당자명" search AND the legacy "chargerNm" search alias.
  // The UI "담당자명" input writes to the custName URL key directly (Approach A from spec review).
  if (input.custName) conditions.push(ilike(salesCustomerContact.custName, `%${input.custName}%`));
  if (input.customerId) conditions.push(eq(salesCustomerContact.customerId, input.customerId));
  // New search filters (Task 6 / P2-A):
  // hpNo → ILIKE on hpNo (휴대폰)
  if (input.hpNo) {
    conditions.push(ilike(salesCustomerContact.hpNo, `%${input.hpNo}%`));
  }
  // email → ILIKE on email (이메일)
  if (input.email) {
    conditions.push(ilike(salesCustomerContact.email, `%${input.email}%`));
  }
  // Date range on createdAt (legacy: searchFromInsdate / searchToInsdate — 등록일자)
  // Use explicit KST offset to avoid UTC midnight being 09:00 KST, which would
  // exclude records created between 00:00–08:59 KST on the start date.
  if (input.searchYmdFrom) {
    conditions.push(gte(salesCustomerContact.createdAt, new Date(input.searchYmdFrom + "T00:00:00+09:00")));
  }
  if (input.searchYmdTo) {
    // Include the full end date day by using start of next day
    const toDate = new Date(input.searchYmdTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(salesCustomerContact.createdAt, toDate));
  }

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
    })),
    total: Number(countRows[0]?.count ?? 0),
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
