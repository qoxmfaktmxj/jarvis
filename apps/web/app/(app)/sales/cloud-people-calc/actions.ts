"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
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

type ContractLookup = { contNm: string | null };
type BaseLookup = {
  pjtCode: string | null;
  companyCd: string | null;
  monthAmt: string | null;
};

function serializeCalc(
  r: typeof salesCloudPeopleCalc.$inferSelect,
  base?: BaseLookup,
  contract?: ContractLookup,
): SalesCloudPeopleCalcRow {
  // P0-3 (A5 audit 2026-05-11): monthAmt now derived from sales_cloud_people_base
  // via composite-key LEFT JOIN (legacyEnterCd + contNo + contYear + seq +
  // personType + calcType, sdate <= calc.ym* <= edate). totalAmt fallback:
  // stored value preferred (reflYn='Y' rows are frozen snapshots) — only when
  // stored is null do we synthesize monthAmt × personCnt for display.
  const monthAmt = base?.monthAmt ?? null;
  let totalAmt = r.totalAmt ?? null;
  if (totalAmt === null && monthAmt !== null && r.personCnt !== null) {
    const m = Number(monthAmt);
    const c = r.personCnt;
    if (Number.isFinite(m) && Number.isFinite(c)) {
      // Display-only derivation. Stored totalAmt is the SoT once persisted.
      totalAmt = String(m * c);
    }
  }
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    contNm: contract?.contNm ?? null,
    pjtCode: base?.pjtCode ?? null,
    pjtNm: null,
    companyCd: base?.companyCd ?? null,
    companyNm: null,
    ym: r.ym,
    reflYn: r.reflYn ?? null,
    personType: r.personType,
    calcType: r.calcType,
    monthAmt,
    personCnt: r.personCnt ?? null,
    totalAmt,
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

  // P0-3: Window-match each calc row to a base row whose [sdate, edate] covers
  // calc.ym (treated as ym + '01'/'31' so single-month YYYYMM falls inside an
  // ETL-formatted YYYYMMDD window). edate IS NULL means open-ended.
  //
  //   base.sdate <= ym + '31'
  //   AND (base.edate >= ym + '01' OR base.edate IS NULL)
  //
  // 6-key match: legacyEnterCd, contNo, contYear, seq, personType, calcType.
  // Pagination order adds the calc PK as the ultimate tie-break (P1-4).
  const [rows, countRows] = await Promise.all([
    db
      .select({
        calc: salesCloudPeopleCalc,
        base: {
          pjtCode: salesCloudPeopleBase.pjtCode,
          companyCd: salesCloudPeopleBase.companyCd,
          monthAmt: salesCloudPeopleBase.monthAmt,
        },
        contract: { contNm: salesContract.contNm },
      })
      .from(salesCloudPeopleCalc)
      .leftJoin(
        salesCloudPeopleBase,
        and(
          eq(salesCloudPeopleBase.workspaceId, salesCloudPeopleCalc.workspaceId),
          eq(salesCloudPeopleBase.legacyEnterCd, salesCloudPeopleCalc.legacyEnterCd),
          eq(salesCloudPeopleBase.contNo, salesCloudPeopleCalc.contNo),
          eq(salesCloudPeopleBase.contYear, salesCloudPeopleCalc.contYear),
          eq(salesCloudPeopleBase.seq, salesCloudPeopleCalc.seq),
          eq(salesCloudPeopleBase.personType, salesCloudPeopleCalc.personType),
          eq(salesCloudPeopleBase.calcType, salesCloudPeopleCalc.calcType),
          lte(salesCloudPeopleBase.sdate, sql`${salesCloudPeopleCalc.ym} || '31'`),
          or(
            isNull(salesCloudPeopleBase.edate),
            gte(salesCloudPeopleBase.edate, sql`${salesCloudPeopleCalc.ym} || '01'`),
          ),
        ),
      )
      .leftJoin(
        salesContract,
        and(
          eq(salesContract.workspaceId, salesCloudPeopleCalc.workspaceId),
          eq(salesContract.legacyEnterCd, salesCloudPeopleCalc.legacyEnterCd),
          eq(salesContract.legacyContYear, salesCloudPeopleCalc.contYear),
          eq(salesContract.legacyContNo, salesCloudPeopleCalc.contNo),
        ),
      )
      .where(where)
      .orderBy(desc(salesCloudPeopleCalc.ym), salesCloudPeopleCalc.contNo, salesCloudPeopleCalc.id)
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesCloudPeopleCalc).where(where),
  ]);

  return listCloudPeopleCalcOutput.parse({
    ok: true,
    rows: rows.map((r) => serializeCalc(r.calc, r.base ?? undefined, r.contract ?? undefined)),
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
          .returning({
            id: salesCloudPeopleCalc.id,
            workspaceId: salesCloudPeopleCalc.workspaceId,
            legacyEnterCd: salesCloudPeopleCalc.legacyEnterCd,
            contNo: salesCloudPeopleCalc.contNo,
            contYear: salesCloudPeopleCalc.contYear,
            seq: salesCloudPeopleCalc.seq,
            personType: salesCloudPeopleCalc.personType,
            calcType: salesCloudPeopleCalc.calcType,
            ym: salesCloudPeopleCalc.ym,
            reflYn: salesCloudPeopleCalc.reflYn,
            personCnt: salesCloudPeopleCalc.personCnt,
            totalAmt: salesCloudPeopleCalc.totalAmt,
          });
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

          // P0-4 (A5 audit 2026-05-11): When personCnt changes on a non-frozen
          // row, recompute totalAmt = base.monthAmt × personCnt. Frozen rows
          // (reflYn = 'Y') are NOT recomputed — they're 전표 반영 snapshots.
          // Client-supplied totalAmt in `changes` is also honored: only when
          // personCnt is in the patch but totalAmt is NOT do we derive.
          const personCntInPatch = Object.prototype.hasOwnProperty.call(changes, "personCnt");
          const totalAmtInPatch = Object.prototype.hasOwnProperty.call(changes, "totalAmt");
          const isFrozen = row.reflYn === "Y";
          if (personCntInPatch && !totalAmtInPatch && !isFrozen) {
            // Lookup matching base row whose window covers this ym.
            const baseConditions = [
              eq(salesCloudPeopleBase.workspaceId, row.workspaceId),
              eq(salesCloudPeopleBase.contNo, row.contNo),
              eq(salesCloudPeopleBase.contYear, row.contYear),
              eq(salesCloudPeopleBase.seq, row.seq),
              eq(salesCloudPeopleBase.personType, row.personType),
              eq(salesCloudPeopleBase.calcType, row.calcType),
              lte(salesCloudPeopleBase.sdate, sql`${row.ym} || '31'`),
              or(
                isNull(salesCloudPeopleBase.edate),
                gte(salesCloudPeopleBase.edate, sql`${row.ym} || '01'`),
              )!,
            ];
            if (row.legacyEnterCd === null) {
              baseConditions.push(isNull(salesCloudPeopleBase.legacyEnterCd));
            } else {
              baseConditions.push(eq(salesCloudPeopleBase.legacyEnterCd, row.legacyEnterCd));
            }
            const [baseRow] = await tx
              .select({ monthAmt: salesCloudPeopleBase.monthAmt })
              .from(salesCloudPeopleBase)
              .where(and(...baseConditions))
              .limit(1);
            if (baseRow && baseRow.monthAmt !== null && row.personCnt !== null) {
              const m = Number(baseRow.monthAmt);
              if (Number.isFinite(m)) {
                await tx
                  .update(salesCloudPeopleCalc)
                  .set({
                    totalAmt: String(m * row.personCnt),
                    updatedAt: new Date(),
                    updatedBy: ctx.userId ?? undefined,
                  })
                  .where(eq(salesCloudPeopleCalc.id, row.id));
              }
            }
          }
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

