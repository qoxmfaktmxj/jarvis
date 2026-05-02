"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesCloudPeopleBase } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCloudPeopleBaseInput,
  listCloudPeopleBaseOutput,
  saveCloudPeopleBaseInput,
  savePeopleOutput,
  type SalesCloudPeopleBaseRow,
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

function serializeBase(r: typeof salesCloudPeopleBase.$inferSelect): SalesCloudPeopleBaseRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    contNm: null,
    pjtCode: r.pjtCode ?? null,
    pjtNm: null,
    companyCd: r.companyCd ?? null,
    companyNm: null,
    personType: r.personType,
    calcType: r.calcType,
    sdate: r.sdate,
    edate: r.edate ?? null,
    monthAmt: r.monthAmt ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listCloudPeopleBase(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return listCloudPeopleBaseOutput.parse({ ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 });
  }

  const input = listCloudPeopleBaseInput.parse(rawInput);
  const conditions = [eq(salesCloudPeopleBase.workspaceId, ctx.workspaceId)];
  if (input.contYear) conditions.push(eq(salesCloudPeopleBase.contYear, input.contYear));
  if (input.pjtCode) conditions.push(eq(salesCloudPeopleBase.pjtCode, input.pjtCode));
  if (input.personType) conditions.push(eq(salesCloudPeopleBase.personType, input.personType));
  if (input.calcType) conditions.push(eq(salesCloudPeopleBase.calcType, input.calcType));
  if (input.q) {
    conditions.push(
      or(
        ilike(salesCloudPeopleBase.contNo, `%${input.q}%`),
        ilike(salesCloudPeopleBase.pjtCode, `%${input.q}%`),
        ilike(salesCloudPeopleBase.companyCd, `%${input.q}%`),
      )!,
    );
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(salesCloudPeopleBase).where(where).orderBy(desc(salesCloudPeopleBase.contYear), salesCloudPeopleBase.contNo).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesCloudPeopleBase).where(where),
  ]);

  return listCloudPeopleBaseOutput.parse({
    ok: true,
    rows: rows.map(serializeBase),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveCloudPeopleBase(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return savePeopleOutput.parse({ ok: false, created: 0, updated: 0, deleted: 0, errors: [{ code: "UNAUTHORIZED", message: ctx.error }] });
  }

  const input = saveCloudPeopleBaseInput.parse(rawInput);
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: { code: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const inserted = await tx
          .insert(salesCloudPeopleBase)
          .values(input.creates.map((row) => ({ ...row, workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined, updatedBy: ctx.userId ?? undefined })))
          .returning({ id: salesCloudPeopleBase.id });
        created = inserted.length;
        if (inserted.length > 0) {
          await tx.insert(auditLog).values(inserted.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_base.batch_save",
            resourceType: "sales_cloud_people_base",
            resourceId: row.id,
            details: {},
            success: true,
          })));
        }
      }

      for (const patch of input.updates) {
        const { id, ...changes } = patch;
        const [row] = await tx
          .update(salesCloudPeopleBase)
          .set({ ...changes, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(and(eq(salesCloudPeopleBase.id, id), eq(salesCloudPeopleBase.workspaceId, ctx.workspaceId)))
          .returning({ id: salesCloudPeopleBase.id });
        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_base.batch_save",
            resourceType: "sales_cloud_people_base",
            resourceId: row.id,
            details: changes,
            success: true,
          });
        }
      }

      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesCloudPeopleBase)
          .where(and(eq(salesCloudPeopleBase.workspaceId, ctx.workspaceId), inArray(salesCloudPeopleBase.id, input.deletes)))
          .returning({ id: salesCloudPeopleBase.id });
        deleted = removed.length;
        if (removed.length > 0) {
          await tx.insert(auditLog).values(removed.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_base.batch_save",
            resourceType: "sales_cloud_people_base",
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

  revalidatePath("/sales/cloud-people-base");
  return savePeopleOutput.parse({ ok: errors.length === 0, created, updated, deleted, ...(errors.length ? { errors } : {}) });
}

