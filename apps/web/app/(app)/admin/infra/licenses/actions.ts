"use server";
/**
 * apps/web/app/(app)/admin/infra/licenses/actions.ts
 *
 * 인프라 라이선스 (TBIZ500) server actions.
 *
 * 권한: ADMIN_ALL — Phase-Sales P1.5에서는 SYSTEM_* 권한이 아직 PERMISSIONS에
 * 정의되지 않았으므로 기존 admin/companies와 동일하게 ADMIN_ALL을 사용한다.
 * SYSTEM_READ/CREATE/UPDATE/DELETE 분리는 Task 10 또는 별도 권한 정비 PR에서.
 *
 * 감사: infra.license.{create,update,delete}
 */
import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, company, infraLicense } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listInfraLicensesInput,
  listInfraLicensesOutput,
  saveInfraLicensesInput,
  saveInfraLicensesOutput,
  type InfraLicenseRow,
} from "@jarvis/shared/validation/infra/license";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirroring admin/companies/actions.ts)
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

async function resolveAdminContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
    employeeId: session.employeeId,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------
function serialize(r: typeof infraLicense.$inferSelect): InfraLicenseRow {
  return {
    id: r.id,
    companyId: r.companyId,
    legacyCompanyCd: r.legacyCompanyCd ?? null,
    legacyCompanyNm: r.legacyCompanyNm ?? null,
    symd: r.symd,
    eymd: r.eymd ?? null,
    devGbCode: r.devGbCode,
    domainAddr: r.domainAddr ?? null,
    ipAddr: r.ipAddr ?? null,
    userCnt: r.userCnt ?? null,
    corpCnt: r.corpCnt ?? null,
    empYn: r.empYn,
    hrYn: r.hrYn,
    orgYn: r.orgYn,
    eduYn: r.eduYn,
    papYn: r.papYn,
    carYn: r.carYn,
    cpnYn: r.cpnYn,
    timYn: r.timYn,
    benYn: r.benYn,
    appYn: r.appYn,
    eisYn: r.eisYn,
    sysYn: r.sysYn,
    yearYn: r.yearYn,
    boardYn: r.boardYn,
    wlYn: r.wlYn,
    pdsYn: r.pdsYn,
    idpYn: r.idpYn,
    abhrYn: r.abhrYn,
    workYn: r.workYn,
    secYn: r.secYn,
    docYn: r.docYn,
    disYn: r.disYn,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

// ---------------------------------------------------------------------------
// listInfraLicenses
// ---------------------------------------------------------------------------
export async function listInfraLicenses(rawInput: z.input<typeof listInfraLicensesInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listInfraLicensesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  // q: 회사명/legacy code/도메인/IP에서 부분일치
  // searchDevGbCd: B10025 code group filter (URL param from useUrlFilters, alias for devGbCode)
  const effectiveDevGbCode = input.searchDevGbCd || input.devGbCode;
  const where = and(
    eq(infraLicense.workspaceId, ctx.workspaceId),
    effectiveDevGbCode ? eq(infraLicense.devGbCode, effectiveDevGbCode) : undefined,
    input.companyId ? eq(infraLicense.companyId, input.companyId) : undefined,
    input.q
      ? or(
          ilike(infraLicense.legacyCompanyCd, `%${input.q}%`),
          ilike(infraLicense.legacyCompanyNm, `%${input.q}%`),
          ilike(infraLicense.domainAddr, `%${input.q}%`),
          ilike(infraLicense.ipAddr, `%${input.q}%`),
        )
      : undefined,
  );

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(infraLicense)
      .where(where)
      .orderBy(desc(infraLicense.symd))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(infraLicense).where(where),
  ]);

  return listInfraLicensesOutput.parse({
    rows: rows.map(serialize),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveInfraLicenses (creates/updates/deletes batch transaction + audit_log)
// ---------------------------------------------------------------------------
export async function saveInfraLicenses(rawInput: z.input<typeof saveInfraLicensesInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return saveInfraLicensesOutput.parse({ ok: false, errors: [{ message: ctx.error }] });

  const input = saveInfraLicensesInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        // legacy_company_* stamp from company table at create-time (audit hint)
        const [comp] = await tx
          .select({ code: company.code, name: company.name })
          .from(company)
          .where(and(eq(company.id, c.companyId), eq(company.workspaceId, ctx.workspaceId)))
          .limit(1);

        await tx.insert(infraLicense).values({
          id: c.id,
          workspaceId: ctx.workspaceId,
          companyId: c.companyId,
          legacyCompanyCd: c.legacyCompanyCd ?? comp?.code ?? null,
          legacyCompanyNm: c.legacyCompanyNm ?? comp?.name ?? null,
          symd: c.symd,
          eymd: c.eymd ?? null,
          devGbCode: c.devGbCode,
          domainAddr: c.domainAddr ?? null,
          ipAddr: c.ipAddr ?? null,
          userCnt: c.userCnt ?? null,
          corpCnt: c.corpCnt ?? null,
          empYn: c.empYn,
          hrYn: c.hrYn,
          orgYn: c.orgYn,
          eduYn: c.eduYn,
          papYn: c.papYn,
          carYn: c.carYn,
          cpnYn: c.cpnYn,
          timYn: c.timYn,
          benYn: c.benYn,
          appYn: c.appYn,
          eisYn: c.eisYn,
          sysYn: c.sysYn,
          yearYn: c.yearYn,
          boardYn: c.boardYn,
          wlYn: c.wlYn,
          pdsYn: c.pdsYn,
          idpYn: c.idpYn,
          abhrYn: c.abhrYn,
          workYn: c.workYn,
          secYn: c.secYn,
          docYn: c.docYn,
          disYn: c.disYn,
          createdBy: ctx.userId,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "infra.license.create",
          resourceType: "infra_license",
          resourceId: c.id,
          details: {
            companyId: c.companyId,
            devGbCode: c.devGbCode,
            symd: c.symd,
          } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // strip output-only audit fields from patch before update
        const {
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          createdBy: _createdBy,
          updatedBy: _updatedBy,
          id: _id,
          ...patch
        } = u.patch;
        await tx
          .update(infraLicense)
          .set({
            ...patch,
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(infraLicense.id, u.id), eq(infraLicense.workspaceId, ctx.workspaceId)),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "infra.license.update",
          resourceType: "infra_license",
          resourceId: u.id,
          details: patch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        // capture rows before deletion to record audit details
        const condemned = await tx
          .select({
            id: infraLicense.id,
            companyId: infraLicense.companyId,
            devGbCode: infraLicense.devGbCode,
            symd: infraLicense.symd,
          })
          .from(infraLicense)
          .where(
            and(
              eq(infraLicense.workspaceId, ctx.workspaceId),
              inArray(infraLicense.id, input.deletes),
            ),
          );

        await tx
          .delete(infraLicense)
          .where(
            and(
              eq(infraLicense.workspaceId, ctx.workspaceId),
              inArray(infraLicense.id, input.deletes),
            ),
          );
        const detailsById = new Map(condemned.map((r) => [r.id, r] as const));
        for (const id of input.deletes) {
          const row = detailsById.get(id);
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "infra.license.delete",
            resourceType: "infra_license",
            resourceId: id,
            details: row
              ? ({
                  companyId: row.companyId,
                  devGbCode: row.devGbCode,
                  symd: row.symd,
                } as Record<string, unknown>)
              : ({} as Record<string, unknown>),
            success: true,
          });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveInfraLicensesOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
