"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  salesCloudPeopleBase,
  salesCloudPeopleCalc,
  salesContract,
} from "@jarvis/db/schema";
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
  if (!hasPermission(session, PERMISSIONS.SALES_ADMIN)) return { ok: false as const, error: "Forbidden" };
  return { ok: true as const, userId: session.userId, workspaceId: session.workspaceId };
}

type ContractLookup = {
  contNm: string | null;
  // sales_contract has no pjtNm column directly; populated via separate map.
};

function serializeBase(
  r: typeof salesCloudPeopleBase.$inferSelect,
  contract?: ContractLookup,
): SalesCloudPeopleBaseRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    // P0-3 (A5 audit 2026-05-11): contNm now joined from sales_contract; pjtNm /
    // companyNm remain null until project / company master tables are linked
    // (no FK to sales_contract for pjtNm — TBIZ030 doesn't carry it either).
    contNm: contract?.contNm ?? null,
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
    // P0-3: LEFT JOIN sales_contract for contNm (4-key composite: workspace +
    // legacyEnterCd + contYear + contNo). pjtNm/companyNm intentionally null —
    // TBIZ030 has neither, and base.companyCd is a free-text code anyway.
    db
      .select({
        base: salesCloudPeopleBase,
        contract: { contNm: salesContract.contNm },
      })
      .from(salesCloudPeopleBase)
      .leftJoin(
        salesContract,
        and(
          eq(salesContract.workspaceId, salesCloudPeopleBase.workspaceId),
          eq(salesContract.legacyEnterCd, salesCloudPeopleBase.legacyEnterCd),
          eq(salesContract.legacyContYear, salesCloudPeopleBase.contYear),
          eq(salesContract.legacyContNo, salesCloudPeopleBase.contNo),
        ),
      )
      .where(where)
      .orderBy(desc(salesCloudPeopleBase.contYear), salesCloudPeopleBase.contNo, salesCloudPeopleBase.id)
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesCloudPeopleBase).where(where),
  ]);

  return listCloudPeopleBaseOutput.parse({
    ok: true,
    rows: rows.map((r) => serializeBase(r.base, r.contract ?? undefined)),
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
          .returning({
            id: salesCloudPeopleBase.id,
            workspaceId: salesCloudPeopleBase.workspaceId,
            legacyEnterCd: salesCloudPeopleBase.legacyEnterCd,
            contNo: salesCloudPeopleBase.contNo,
            contYear: salesCloudPeopleBase.contYear,
            seq: salesCloudPeopleBase.seq,
            personType: salesCloudPeopleBase.personType,
            calcType: salesCloudPeopleBase.calcType,
            sdate: salesCloudPeopleBase.sdate,
            edate: salesCloudPeopleBase.edate,
            monthAmt: salesCloudPeopleBase.monthAmt,
          });
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

          // P0-4 (A5 audit 2026-05-11): cascade base.monthAmt change to
          // sales_cloud_people_calc.totalAmt for non-frozen calc rows whose
          // [sdate, edate] window covers calc.ym. Frozen rows (reflYn = 'Y')
          // are 전표 반영 완료 snapshots and must NOT be recomputed.
          //
          // Only triggers when monthAmt key is present in the patch. Other
          // base mutations (note, edate) leave totalAmt untouched.
          if (Object.prototype.hasOwnProperty.call(changes, "monthAmt")) {
            const newMonthAmt = row.monthAmt;
            const cascadeConditions = [
              eq(salesCloudPeopleCalc.workspaceId, row.workspaceId),
              eq(salesCloudPeopleCalc.contNo, row.contNo),
              eq(salesCloudPeopleCalc.contYear, row.contYear),
              eq(salesCloudPeopleCalc.seq, row.seq),
              eq(salesCloudPeopleCalc.personType, row.personType),
              eq(salesCloudPeopleCalc.calcType, row.calcType),
              or(ne(salesCloudPeopleCalc.reflYn, "Y"), isNull(salesCloudPeopleCalc.reflYn))!,
              lte(sql`${row.sdate}`, sql`${salesCloudPeopleCalc.ym} || '31'`),
              or(
                isNull(sql`${row.edate}`),
                gte(sql`${row.edate}`, sql`${salesCloudPeopleCalc.ym} || '01'`),
              )!,
            ];
            if (row.legacyEnterCd === null) {
              cascadeConditions.push(isNull(salesCloudPeopleCalc.legacyEnterCd));
            } else {
              cascadeConditions.push(eq(salesCloudPeopleCalc.legacyEnterCd, row.legacyEnterCd));
            }
            if (newMonthAmt === null) {
              // base.monthAmt cleared → null out non-frozen calc.totalAmt.
              await tx
                .update(salesCloudPeopleCalc)
                .set({ totalAmt: null, updatedAt: new Date(), updatedBy: ctx.userId ?? undefined })
                .where(and(...cascadeConditions));
            } else {
              // Recompute monthAmt × personCnt for rows with personCnt set.
              cascadeConditions.push(sql`${salesCloudPeopleCalc.personCnt} IS NOT NULL`);
              await tx
                .update(salesCloudPeopleCalc)
                .set({
                  totalAmt: sql`(${newMonthAmt}::numeric * ${salesCloudPeopleCalc.personCnt})::text`,
                  updatedAt: new Date(),
                  updatedBy: ctx.userId ?? undefined,
                })
                .where(and(...cascadeConditions));
            }
          }
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

