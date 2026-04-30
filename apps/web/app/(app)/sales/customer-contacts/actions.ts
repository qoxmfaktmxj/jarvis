"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomerContact, auditLog } from "@jarvis/db/schema";
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
  if (input.custName) conditions.push(ilike(salesCustomerContact.custName, `%${input.custName}%`));
  if (input.customerId) conditions.push(eq(salesCustomerContact.customerId, input.customerId));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db.select().from(salesCustomerContact).where(where).orderBy(salesCustomerContact.custMcd).limit(input.limit).offset(offset),
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
        await tx.insert(salesCustomerContact).values({ ...c, workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined });
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.customer_contact.create", resourceType: "sales_customer_contact", resourceId: c.id, details: {} as Record<string, unknown>, success: true });
        created.push(c.id);
      }
      for (const u of input.updates) {
        await tx.update(salesCustomerContact).set({ ...u.patch, updatedAt: new Date() }).where(and(eq(salesCustomerContact.id, u.id), eq(salesCustomerContact.workspaceId, ctx.workspaceId)));
        updated.push(u.id);
      }
      if (input.deletes.length > 0) {
        await tx.delete(salesCustomerContact).where(and(inArray(salesCustomerContact.id, input.deletes), eq(salesCustomerContact.workspaceId, ctx.workspaceId)));
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveCustomerContactsOutput.parse({ ok: errors.length === 0, created, updated, deleted, errors: errors.length > 0 ? errors : undefined });
}
