"use server";

import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContractService, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listContractServicesInput,
  saveContractServicesInput,
  type SalesContractServiceRow,
} from "@jarvis/shared/validation/sales-contract";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Session helpers (same pattern as sales/contracts/actions.ts)
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

function serializeContractService(r: typeof salesContractService.$inferSelect): SalesContractServiceRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacySymd: r.legacySymd ?? null,
    legacyServSabun: r.legacyServSabun ?? null,
    servSabun: r.servSabun,
    servName: r.servName ?? null,
    birYmd: r.birYmd ?? null,
    symd: r.symd ?? null,
    eymd: r.eymd ?? null,
    cpyGbCd: r.cpyGbCd ?? null,
    cpyName: r.cpyName ?? null,
    econtAmt: r.econtAmt ?? null,
    econtCnt: r.econtCnt ?? null,
    job: r.job ?? null,
    tel: r.tel ?? null,
    mail: r.mail ?? null,
    addr: r.addr ?? null,
    attendCd: r.attendCd ?? null,
    skillCd: r.skillCd ?? null,
    cmmncCd: r.cmmncCd ?? null,
    rsponsCd: r.rsponsCd ?? null,
    memo1: r.memo1 ?? null,
    memo2: r.memo2 ?? null,
    memo3: r.memo3 ?? null,
    orgCd: r.orgCd ?? null,
    manager: r.manager ?? null,
    pjtCd: r.pjtCd ?? null,
    pjtNm: r.pjtNm ?? null,
    etc1: r.etc1 ?? null,
    etc2: r.etc2 ?? null,
    etc3: r.etc3 ?? null,
    etc4: r.etc4 ?? null,
    etc5: r.etc5 ?? null,
    etc6: r.etc6 ?? null,
    etc7: r.etc7 ?? null,
    etc8: r.etc8 ?? null,
    etc9: r.etc9 ?? null,
    etc10: r.etc10 ?? null,
    // Audit
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

// ---------------------------------------------------------------------------
// listContractServices
// ---------------------------------------------------------------------------

export async function listContractServices(rawInput: unknown): Promise<{
  ok: boolean;
  rows: SalesContractServiceRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 };

  const input = listContractServicesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const conditions = [eq(salesContractService.workspaceId, ctx.workspaceId)];

  if (input.q) {
    conditions.push(
      or(
        ilike(salesContractService.servName, `%${input.q}%`),
        ilike(salesContractService.job, `%${input.q}%`),
        ilike(salesContractService.servSabun, `%${input.q}%`),
      )!,
    );
  }
  if (input.pjtCd) conditions.push(eq(salesContractService.pjtCd, input.pjtCd));
  if (input.attendCd) conditions.push(eq(salesContractService.attendCd, input.attendCd));

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesContractService)
      .where(where)
      .orderBy(desc(salesContractService.symd), desc(salesContractService.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesContractService).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    ok: true,
    rows: rows.map(serializeContractService),
    total,
    page: input.page,
    limit: input.limit,
  };
}

// ---------------------------------------------------------------------------
// saveContractServices
// ---------------------------------------------------------------------------

export async function saveContractServices(rawInput: unknown): Promise<{
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

  const input = saveContractServicesInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];

  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      if (input.creates.length > 0) {
        const ins = await tx
          .insert(salesContractService)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesContractService.id });
        created = ins.length;

        if (ins.length > 0) {
          await tx.insert(auditLog).values(
            ins.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract_service.batch_save",
              resourceType: "sales_contract_service",
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
          .update(salesContractService)
          .set({
            ...patch,
            updatedBy: ctx.userId ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesContractService.id, id),
              eq(salesContractService.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: salesContractService.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.contract_service.batch_save",
            resourceType: "sales_contract_service",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesContractService)
          .where(
            and(
              eq(salesContractService.workspaceId, ctx.workspaceId),
              inArray(salesContractService.id, input.deletes),
            ),
          )
          .returning({ id: salesContractService.id });
        deleted = removed.length;

        if (removed.length > 0) {
          await tx.insert(auditLog).values(
            removed.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract_service.batch_save",
              resourceType: "sales_contract_service",
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

  revalidatePath("/sales/contract-services");

  return {
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
