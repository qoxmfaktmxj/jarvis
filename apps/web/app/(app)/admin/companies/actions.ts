"use server";

import { cookies, headers } from "next/headers";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, company } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listCompaniesInput,
  saveCompaniesInput,
  saveCompaniesOutput,
  type CompanyRow,
} from "@jarvis/shared/validation/company";

// ---------------------------------------------------------------------------
// Session helpers (matching the pattern in admin/review-queue/actions.ts)
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

function serializeCompany(r: typeof company.$inferSelect): CompanyRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    groupCode: r.groupCode ?? null,
    objectDiv: r.objectDiv,
    manageDiv: r.manageDiv ?? null,
    representCompany: r.representCompany,
    category: r.category ?? null,
    startDate: r.startDate ?? null,
    industryCode: r.industryCode ?? null,
    zip: r.zip ?? null,
    address: r.address ?? null,
    homepage: r.homepage ?? null,
    updatedBy: r.updatedBy ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Task 7: listCompanies
// ---------------------------------------------------------------------------

export async function listCompanies(rawInput: unknown) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listCompaniesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const where = and(
    eq(company.workspaceId, ctx.workspaceId),
    input.q
      ? or(
          ilike(company.code, `%${input.q}%`),
          ilike(company.name, `%${input.q}%`),
        )
      : undefined,
    input.objectDiv ? eq(company.objectDiv, input.objectDiv) : undefined,
    input.groupCode ? eq(company.groupCode, input.groupCode) : undefined,
    input.industryCode ? eq(company.industryCode, input.industryCode) : undefined,
    typeof input.representCompany === "boolean"
      ? eq(company.representCompany, input.representCompany)
      : undefined,
  );

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(company)
      .where(where)
      .orderBy(desc(company.updatedAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(company).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializeCompany),
    total: Number(totalRows[0]?.total ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

// ---------------------------------------------------------------------------
// Task 8: saveCompanies
// ---------------------------------------------------------------------------

export async function saveCompanies(rawInput: unknown) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) {
    return saveCompaniesOutput.parse({
      ok: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [{ code: "UNAUTHORIZED", message: ctx.error }],
    });
  }

  const input = saveCompaniesInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];

  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      if (input.creates.length > 0) {
        const ins = await tx
          .insert(company)
          .values(
            input.creates.map((c) => ({
              ...c,
              workspaceId: ctx.workspaceId,
              updatedBy: ctx.employeeId ?? null,
            })),
          )
          .returning({ id: company.id });
        created = ins.length;

        if (ins.length > 0) {
          await tx.insert(auditLog).values(
            ins.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "company.create",
              resourceType: "company",
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
          .update(company)
          .set({
            ...patch,
            updatedBy: ctx.employeeId ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(company.id, id),
              eq(company.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: company.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "company.update",
            resourceType: "company",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(company)
          .where(
            and(
              eq(company.workspaceId, ctx.workspaceId),
              inArray(company.id, input.deletes),
            ),
          )
          .returning({ id: company.id });
        deleted = removed.length;

        if (removed.length > 0) {
          await tx.insert(auditLog).values(
            removed.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "company.delete",
              resourceType: "company",
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

  return saveCompaniesOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors,
  });
}
