"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesCloudPeopleCalc } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCloudPeopleCalcInput,
  listCloudPeopleCalcOutput,
  saveCloudPeopleCalcInput,
  savePeopleOutput,
  type SalesCloudPeopleCalcCreate,
  type SalesCloudPeopleCalcRow,
  type SalesCloudPeopleCalcUpdate,
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

function normalizeCreate(row: SalesCloudPeopleCalcCreate) {
  return {
    ...row,
    reflDate: row.reflDate ? new Date(row.reflDate) : undefined,
  };
}

function normalizeUpdate(row: SalesCloudPeopleCalcUpdate) {
  return {
    ...row,
    reflDate: row.reflDate ? new Date(row.reflDate) : undefined,
  };
}

function serializeCalc(r: typeof salesCloudPeopleCalc.$inferSelect): SalesCloudPeopleCalcRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    contNm: null,
    pjtCode: null,
    pjtNm: null,
    companyCd: null,
    companyNm: null,
    ym: r.ym,
    reflYn: r.reflYn ?? null,
    personType: r.personType,
    calcType: r.calcType,
    monthAmt: null,
    personCnt: r.personCnt ?? null,
    totalAmt: r.totalAmt ?? null,
    note: r.note ?? null,
    reflId: r.reflId ?? null,
    reflDate: r.reflDate ? r.reflDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listCloudPeopleCalc(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return listCloudPeopleCalcOutput.parse({ ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 });
  }

  const input = listCloudPeopleCalcInput.parse(rawInput);
  const conditions = [eq(salesCloudPeopleCalc.workspaceId, ctx.workspaceId)];
  if (input.contYear) conditions.push(eq(salesCloudPeopleCalc.contYear, input.contYear));
  if (input.ym) conditions.push(eq(salesCloudPeopleCalc.ym, input.ym));
  if (input.personType) conditions.push(eq(salesCloudPeopleCalc.personType, input.personType));
  if (input.calcType) conditions.push(eq(salesCloudPeopleCalc.calcType, input.calcType));
  if (input.q) {
    conditions.push(
      or(
        ilike(salesCloudPeopleCalc.contNo, `%${input.q}%`),
        ilike(salesCloudPeopleCalc.note, `%${input.q}%`),
      )!,
    );
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(salesCloudPeopleCalc).where(where).orderBy(desc(salesCloudPeopleCalc.ym), salesCloudPeopleCalc.contNo).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesCloudPeopleCalc).where(where),
  ]);

  return listCloudPeopleCalcOutput.parse({
    ok: true,
    rows: rows.map(serializeCalc),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveCloudPeopleCalc(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return savePeopleOutput.parse({ ok: false, created: 0, updated: 0, deleted: 0, errors: [{ code: "UNAUTHORIZED", message: ctx.error }] });
  }

  const input = saveCloudPeopleCalcInput.parse(rawInput);
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: { code: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const inserted = await tx
          .insert(salesCloudPeopleCalc)
          .values(input.creates.map((row) => ({ ...normalizeCreate(row), workspaceId: ctx.workspaceId, createdBy: ctx.userId ?? undefined, updatedBy: ctx.userId ?? undefined })))
          .returning({ id: salesCloudPeopleCalc.id });
        created = inserted.length;
        if (inserted.length > 0) {
          await tx.insert(auditLog).values(inserted.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_calc.batch_save",
            resourceType: "sales_cloud_people_calc",
            resourceId: row.id,
            details: {},
            success: true,
          })));
        }
      }

      for (const patch of input.updates) {
        const { id, ...changes } = normalizeUpdate(patch);
        const [row] = await tx
          .update(salesCloudPeopleCalc)
          .set({ ...changes, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
          .where(and(eq(salesCloudPeopleCalc.id, id), eq(salesCloudPeopleCalc.workspaceId, ctx.workspaceId)))
          .returning({ id: salesCloudPeopleCalc.id });
        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_calc.batch_save",
            resourceType: "sales_cloud_people_calc",
            resourceId: row.id,
            details: changes,
            success: true,
          });
        }
      }

      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesCloudPeopleCalc)
          .where(and(eq(salesCloudPeopleCalc.workspaceId, ctx.workspaceId), inArray(salesCloudPeopleCalc.id, input.deletes)))
          .returning({ id: salesCloudPeopleCalc.id });
        deleted = removed.length;
        if (removed.length > 0) {
          await tx.insert(auditLog).values(removed.map((row) => ({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.cloud_people_calc.batch_save",
            resourceType: "sales_cloud_people_calc",
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

  revalidatePath("/sales/cloud-people-calc");
  return savePeopleOutput.parse({ ok: errors.length === 0, created, updated, deleted, ...(errors.length ? { errors } : {}) });
}

