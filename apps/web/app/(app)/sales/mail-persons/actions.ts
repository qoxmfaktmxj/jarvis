"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesMailPerson, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listMailPersonsInput,
  listMailPersonsOutput,
  saveMailPersonsInput,
  saveMailPersonsOutput,
} from "@jarvis/shared/validation/sales/mail-person";
import type { z } from "zod";

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return headerStore.get("x-session-id") ?? cookieStore.get("sessionId")?.value ?? cookieStore.get("jarvis_session")?.value ?? null;
}

async function resolveSalesContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) return { ok: false as const, error: "Forbidden" };
  return { ok: true as const, userId: session.userId, workspaceId: session.workspaceId };
}

export async function listMailPersons(rawInput: z.input<typeof listMailPersonsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listMailPersonsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;
  const conditions = [eq(salesMailPerson.workspaceId, ctx.workspaceId)];
  if (input.sabun) conditions.push(ilike(salesMailPerson.sabun, `%${input.sabun}%`));
  if (input.name) conditions.push(ilike(salesMailPerson.name, `%${input.name}%`));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db.select().from(salesMailPerson).where(where).orderBy(salesMailPerson.sabun).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesMailPerson).where(where),
  ]);

  return listMailPersonsOutput.parse({
    rows: rows.map((r) => ({ id: r.id, sabun: r.sabun, name: r.name, mailId: r.mailId, salesYn: r.salesYn, insaYn: r.insaYn, memo: r.memo })),
    total: Number(countRows[0]?.count ?? 0),
  });
}

export async function saveMailPersons(rawInput: z.input<typeof saveMailPersonsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const input = saveMailPersonsInput.parse(rawInput);
  const created: string[] = []; const updated: string[] = []; const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of input.creates) {
        await tx.insert(salesMailPerson).values({ ...c, workspaceId: ctx.workspaceId });
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.mail_person.create", resourceType: "sales_mail_person", resourceId: c.id, details: {} as Record<string, unknown>, success: true });
        created.push(c.id);
      }
      for (const u of input.updates) {
        await tx.update(salesMailPerson).set({ ...u.patch, updatedAt: new Date() }).where(and(eq(salesMailPerson.id, u.id), eq(salesMailPerson.workspaceId, ctx.workspaceId)));
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.mail_person.update", resourceType: "sales_mail_person", resourceId: u.id, details: u.patch as Record<string, unknown>, success: true });
        updated.push(u.id);
      }
      if (input.deletes.length > 0) {
        await tx.delete(salesMailPerson).where(and(inArray(salesMailPerson.id, input.deletes), eq(salesMailPerson.workspaceId, ctx.workspaceId)));
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.mail_person.delete", resourceType: "sales_mail_person", resourceId: id, details: {} as Record<string, unknown>, success: true });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) { errors.push({ message: e instanceof Error ? e.message : "save failed" }); }

  return saveMailPersonsOutput.parse({ ok: errors.length === 0, created, updated, deleted, errors: errors.length > 0 ? errors : undefined });
}
