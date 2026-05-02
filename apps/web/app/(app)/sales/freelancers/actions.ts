"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesFreelancer } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listFreelancersInput,
  listFreelancersOutput,
  saveFreelancersInput,
  savePeopleOutput,
  type SalesFreelancerRow,
} from "@jarvis/shared/validation/sales-people";

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

function serializeFreelancer(r: typeof salesFreelancer.$inferSelect): SalesFreelancerRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    sabun: r.sabun,
    name: r.name ?? null,
    resNo: r.resNo ?? null,
    pjtCd: r.pjtCd ?? null,
    pjtNm: r.pjtNm ?? null,
    sdate: r.sdate ?? null,
    edate: r.edate ?? null,
    addr: r.addr ?? null,
    tel: r.tel ?? null,
    mailId: r.mailId ?? null,
    belongYm: r.belongYm,
    businessCd: r.businessCd,
    totMon: r.totMon ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listFreelancers(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return listFreelancersOutput.parse({ ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 });
  }

  const input = listFreelancersInput.parse(rawInput);
  const conditions = [eq(salesFreelancer.workspaceId, ctx.workspaceId)];
  if (input.belongYm) conditions.push(eq(salesFreelancer.belongYm, input.belongYm));
  if (input.businessCd) conditions.push(eq(salesFreelancer.businessCd, input.businessCd));
  if (input.q) {
    conditions.push(
      or(
        ilike(salesFreelancer.sabun, `%${input.q}%`),
        ilike(salesFreelancer.name, `%${input.q}%`),
        ilike(salesFreelancer.pjtNm, `%${input.q}%`),
      )!,
    );
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesFreelancer)
      .where(where)
      .orderBy(desc(salesFreelancer.belongYm), salesFreelancer.sabun)
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesFreelancer).where(where),
  ]);

  return listFreelancersOutput.parse({
    ok: true,
    rows: rows.map(serializeFreelancer),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveFreelancers(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return savePeopleOutput.parse({
      ok: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [{ code: "UNAUTHORIZED", message: ctx.error }],
    });
  }

  const input = saveFreelancersInput.parse(rawInput);
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: { code: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const inserted = await tx
          .insert(salesFreelancer)
          .values(input.creates.map((row) => ({ ...row, workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined, updatedBy: ctx.userId ?? undefined })))
          .returning({ id: salesFreelancer.id });
        created = inserted.length;
        if (inserted.length > 0) {
          await tx.insert(auditLog).values(inserted.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.freelancer.batch_save",
            resourceType: "sales_freelancer",
            resourceId: row.id,
            details: {},
            success: true,
          })));
        }
      }

      for (const patch of input.updates) {
        const { id, ...changes } = patch;
        const [row] = await tx
          .update(salesFreelancer)
          .set({ ...changes, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(and(eq(salesFreelancer.id, id), eq(salesFreelancer.workspaceId, ctx.workspaceId)))
          .returning({ id: salesFreelancer.id });
        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.freelancer.batch_save",
            resourceType: "sales_freelancer",
            resourceId: row.id,
            details: changes,
            success: true,
          });
        }
      }

      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesFreelancer)
          .where(and(eq(salesFreelancer.workspaceId, ctx.workspaceId), inArray(salesFreelancer.id, input.deletes)))
          .returning({ id: salesFreelancer.id });
        deleted = removed.length;
        if (removed.length > 0) {
          await tx.insert(auditLog).values(removed.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.freelancer.batch_save",
            resourceType: "sales_freelancer",
            resourceId: row.id,
            details: {},
            success: true,
          })));
        }
      }
    });
  } catch (e: unknown) {
    errors.push({ code: "SAVE_FAILED", message: e instanceof Error ? e.message : "save failed" });
  }

  revalidatePath("/sales/freelancers");
  return savePeopleOutput.parse({ ok: errors.length === 0, created, updated, deleted, ...(errors.length ? { errors } : {}) });
}

