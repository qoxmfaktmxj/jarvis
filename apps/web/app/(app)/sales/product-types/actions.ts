"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesProductType, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProductTypesInput,
  listProductTypesOutput,
  saveProductTypesInput,
  saveProductTypesOutput,
} from "@jarvis/shared/validation/sales/product-type";
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

export async function listProductTypes(rawInput: z.input<typeof listProductTypesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listProductTypesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;
  const conditions = [eq(salesProductType.workspaceId, ctx.workspaceId)];
  if (input.productCd) conditions.push(ilike(salesProductType.productCd, `%${input.productCd}%`));
  if (input.productNm) conditions.push(ilike(salesProductType.productNm, `%${input.productNm}%`));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db.select().from(salesProductType).where(where).orderBy(salesProductType.productCd).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesProductType).where(where),
  ]);

  return listProductTypesOutput.parse({
    rows: rows.map((r) => ({ id: r.id, productCd: r.productCd, productNm: r.productNm, costMappingJson: r.costMappingJson ?? null })),
    total: Number(countRows[0]?.count ?? 0),
  });
}

export async function saveProductTypes(rawInput: z.input<typeof saveProductTypesInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const input = saveProductTypesInput.parse(rawInput);
  const created: string[] = []; const updated: string[] = []; const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of input.creates) {
        await tx.insert(salesProductType).values({ ...c, workspaceId: ctx.workspaceId });
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.product_type.create", resourceType: "sales_product_type", resourceId: c.id, details: {} as Record<string, unknown>, success: true });
        created.push(c.id);
      }
      for (const u of input.updates) {
        await tx.update(salesProductType).set({ ...u.patch, updatedAt: new Date() }).where(and(eq(salesProductType.id, u.id), eq(salesProductType.workspaceId, ctx.workspaceId)));
        await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.product_type.update", resourceType: "sales_product_type", resourceId: u.id, details: u.patch as Record<string, unknown>, success: true });
        updated.push(u.id);
      }
      if (input.deletes.length > 0) {
        await tx.delete(salesProductType).where(and(inArray(salesProductType.id, input.deletes), eq(salesProductType.workspaceId, ctx.workspaceId)));
        for (const id of input.deletes) {
          await tx.insert(auditLog).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "sales.product_type.delete", resourceType: "sales_product_type", resourceId: id, details: {} as Record<string, unknown>, success: true });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) { errors.push({ message: e instanceof Error ? e.message : "save failed" }); }

  return saveProductTypesOutput.parse({ ok: errors.length === 0, created, updated, deleted, errors: errors.length > 0 ? errors : undefined });
}
