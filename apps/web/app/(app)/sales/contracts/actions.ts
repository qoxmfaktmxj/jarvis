"use server";

import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContract, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listContractsInput,
  saveContractsInput,
  type SalesContractRow,
} from "@jarvis/shared/validation/sales-contract";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Session helpers (same pattern as sales/customers/actions.ts)
// ---------------------------------------------------------------------------

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
    employeeId: session.employeeId,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeContract(r: typeof salesContract.$inferSelect): SalesContractRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    companyType: r.companyType ?? null,
    companyCd: r.companyCd ?? null,
    companyGrpNm: r.companyGrpNm ?? null,
    companyNm: r.companyNm ?? null,
    companyNo: r.companyNo ?? null,
    customerNo: r.customerNo ?? null,
    customerEmail: r.customerEmail ?? null,
    contNm: r.contNm ?? null,
    custNm: r.custNm ?? null,
    contGbCd: r.contGbCd ?? null,
    contYmd: r.contYmd ?? null,
    contSymd: r.contSymd ?? null,
    contEymd: r.contEymd ?? null,
    mainContType: r.mainContType ?? null,
    newYn: r.newYn ?? null,
    inOutType: r.inOutType ?? null,
    startAmt: r.startAmt ?? null,
    startAmtRate: r.startAmtRate ?? null,
    interimAmt1: r.interimAmt1 ?? null,
    interimAmt2: r.interimAmt2 ?? null,
    interimAmt3: r.interimAmt3 ?? null,
    interimAmt4: r.interimAmt4 ?? null,
    interimAmt5: r.interimAmt5 ?? null,
    interimAmtRate1: r.interimAmtRate1 ?? null,
    interimAmtRate2: r.interimAmtRate2 ?? null,
    interimAmtRate3: r.interimAmtRate3 ?? null,
    interimAmtRate4: r.interimAmtRate4 ?? null,
    interimAmtRate5: r.interimAmtRate5 ?? null,
    remainAmt: r.remainAmt ?? null,
    remainAmtRate: r.remainAmtRate ?? null,
    contImplYn: r.contImplYn ?? null,
    contPublYn: r.contPublYn ?? null,
    contGrtRate: r.contGrtRate ?? null,
    advanImplYn: r.advanImplYn ?? null,
    advanPublYn: r.advanPublYn ?? null,
    advanGrtRate: r.advanGrtRate ?? null,
    defectImplYn: r.defectImplYn ?? null,
    defectPublYn: r.defectPublYn ?? null,
    defectGrtRate: r.defectGrtRate ?? null,
    defectEymd: r.defectEymd ?? null,
    inspecConfYmd: r.inspecConfYmd ?? null,
    startAmtPlanYmd: r.startAmtPlanYmd ?? null,
    startAmtPublYn: r.startAmtPublYn ?? null,
    interimAmtPlanYmd1: r.interimAmtPlanYmd1 ?? null,
    interimAmtPublYn1: r.interimAmtPublYn1 ?? null,
    interimAmtPlanYmd2: r.interimAmtPlanYmd2 ?? null,
    interimAmtPublYn2: r.interimAmtPublYn2 ?? null,
    interimAmtPlanYmd3: r.interimAmtPlanYmd3 ?? null,
    interimAmtPublYn3: r.interimAmtPublYn3 ?? null,
    interimAmtPlanYmd4: r.interimAmtPlanYmd4 ?? null,
    interimAmtPublYn4: r.interimAmtPublYn4 ?? null,
    interimAmtPlanYmd5: r.interimAmtPlanYmd5 ?? null,
    interimAmtPublYn5: r.interimAmtPublYn5 ?? null,
    remainAmtPlanYmd: r.remainAmtPlanYmd ?? null,
    remainAmtPublYn: r.remainAmtPublYn ?? null,
    befContNo: r.befContNo ?? null,
    contCancelYn: r.contCancelYn ?? null,
    contInitYn: r.contInitYn ?? null,
    fileSeq: r.fileSeq ?? null,
    docNo: r.docNo ?? null,
    companyAddr: r.companyAddr ?? null,
    companyOner: r.companyOner ?? null,
    sucProb: r.sucProb ?? null,
    memo: r.memo ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

// ---------------------------------------------------------------------------
// listContracts
// ---------------------------------------------------------------------------

export async function listContracts(rawInput: unknown): Promise<{
  ok: boolean;
  rows: SalesContractRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 };

  const input = listContractsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesContract.workspaceId, ctx.workspaceId)];

  if (input.q) {
    const orFilter = or(
      ilike(salesContract.contNm, `%${input.q}%`),
      ilike(salesContract.companyNm, `%${input.q}%`),
      ilike(salesContract.legacyContNo, `%${input.q}%`),
    );
    if (orFilter) conditions.push(orFilter);
  }
  if (input.customerNo) conditions.push(eq(salesContract.customerNo, input.customerNo));
  if (input.contGbCd) conditions.push(eq(salesContract.contGbCd, input.contGbCd));

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesContract)
      .where(where)
      .orderBy(desc(salesContract.contYmd), desc(salesContract.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesContract).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    ok: true,
    rows: rows.map(serializeContract),
    total,
    page: input.page,
    limit: input.limit,
  };
}

// ---------------------------------------------------------------------------
// saveContracts
// ---------------------------------------------------------------------------

export async function saveContracts(rawInput: unknown): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  errors?: { code: string; message: string }[];
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [{ code: "UNAUTHORIZED", message: ctx.error }],
    };
  }

  const input = saveContractsInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];

  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      if (input.creates.length > 0) {
        const ins = await tx
          .insert(salesContract)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesContract.id });
        created = ins.length;

        if (ins.length > 0) {
          await tx.insert(auditLog).values(
            ins.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract.create",
              resourceType: "sales_contract",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        const { id, ...patch } = u;
        const [row] = await tx
          .update(salesContract)
          .set({
            ...patch,
            updatedBy: ctx.userId ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesContract.id, id),
              eq(salesContract.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: salesContract.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.contract.update",
            resourceType: "sales_contract",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesContract)
          .where(
            and(
              eq(salesContract.workspaceId, ctx.workspaceId),
              inArray(salesContract.id, input.deletes),
            ),
          )
          .returning({ id: salesContract.id });
        deleted = removed.length;

        if (removed.length > 0) {
          await tx.insert(auditLog).values(
            removed.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract.delete",
              resourceType: "sales_contract",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    errors.push({ code: "SAVE_FAILED", message });
  }

  revalidatePath("/sales/contracts");

  return {
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
