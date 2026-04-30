"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesLicense, salesLicenseCode, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listLicensesInput,
  listLicensesOutput,
  saveLicensesInput,
  saveLicensesOutput,
} from "@jarvis/shared/validation/sales/license";
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

export async function listLicenses(rawInput: z.input<typeof listLicensesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listLicensesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;
  const conditions = [eq(salesLicense.workspaceId, ctx.workspaceId)];
  if (input.licenseNo) conditions.push(ilike(salesLicense.licenseNo, `%${input.licenseNo}%`));
  if (input.customerId) conditions.push(eq(salesLicense.customerId, input.customerId));
  if (input.licenseKindCd) conditions.push(eq(salesLicense.licenseKindCd, input.licenseKindCd));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db.select().from(salesLicense).where(where).orderBy(salesLicense.licenseNo).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesLicense).where(where),
  ]);

  return listLicensesOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      licenseNo: r.licenseNo,
      customerId: r.customerId ?? null,
      productCd: r.productCd ?? null,
      licenseKindCd: r.licenseKindCd ?? null,
      sdate: r.sdate ?? null,
      edate: r.edate ?? null,
      qty: r.qty ?? null,
      remark: r.remark ?? null,
    })),
    total: Number(countRows[0]?.count ?? 0),
  });
}

export async function listLicenseCodes(workspaceId?: string) {
  // Used to populate licenseKindCd options
  if (!workspaceId) {
    const ctx = await resolveSalesContext();
    if (!ctx.ok) return [];
    workspaceId = ctx.workspaceId;
  }
  const rows = await db.select().from(salesLicenseCode).where(eq(salesLicenseCode.workspaceId, workspaceId)).orderBy(salesLicenseCode.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export async function saveLicenses(rawInput: z.input<typeof saveLicensesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const input = saveLicensesInput.parse(rawInput);
  const created: string[] = []; const updated: string[] = []; const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of input.creates) {
        await tx.insert(salesLicense).values({ ...c, workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined });
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.license.create", resourceType: "sales_license", resourceId: c.id, details: {} as Record<string, unknown>, success: true });
        created.push(c.id);
      }
      for (const u of input.updates) {
        await tx.update(salesLicense).set({ ...u.patch, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined }).where(and(eq(salesLicense.id, u.id), eq(salesLicense.workspaceId, ctx.workspaceId)));
        updated.push(u.id);
      }
      if (input.deletes.length > 0) {
        await tx.delete(salesLicense).where(and(inArray(salesLicense.id, input.deletes), eq(salesLicense.workspaceId, ctx.workspaceId)));
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) { errors.push({ message: e instanceof Error ? e.message : "save failed" }); }

  return saveLicensesOutput.parse({ ok: errors.length === 0, created, updated, deleted, errors: errors.length > 0 ? errors : undefined });
}
