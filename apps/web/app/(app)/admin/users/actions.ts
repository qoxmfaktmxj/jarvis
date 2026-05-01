"use server";

import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@jarvis/db/client";
import { auditLog, organization, user } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listUsersInput,
  listUsersOutput,
  saveUsersInput,
  saveUsersOutput,
} from "@jarvis/shared/validation/admin/user";

// ---------------------------------------------------------------------------
// Session helpers (mirrors admin/companies/actions.ts pattern)
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
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export async function listUsers(rawInput: unknown) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) {
    return listUsersOutput.parse({ ok: false, rows: [], total: 0 });
  }

  const input = listUsersInput.parse(rawInput);

  const conds = [eq(user.workspaceId, ctx.workspaceId)];
  if (input.q) {
    const q = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
    conds.push(
      or(ilike(user.name, q), ilike(user.employeeId, q), ilike(user.email, q))!,
    );
  }
  if (input.status && input.status !== "all") {
    conds.push(eq(user.status, input.status));
  }
  if (input.orgId) {
    conds.push(eq(user.orgId, input.orgId));
  }

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: user.id,
        workspaceId: user.workspaceId,
        employeeId: user.employeeId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        orgId: user.orgId,
        orgName: organization.name,
        position: user.position,
        jobTitle: user.jobTitle,
        status: user.status,
        isOutsourced: user.isOutsourced,
        employmentType: user.employmentType,
        updatedBy: user.updatedBy,
        updatedByName:
          sql<string | null>`(SELECT name FROM "user" u2 WHERE u2.id = ${user.updatedBy})`,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .leftJoin(organization, eq(organization.id, user.orgId))
      .where(and(...conds))
      .orderBy(asc(user.employeeId))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(user).where(and(...conds)),
  ]);

  return listUsersOutput.parse({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: Number(countRow?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveUsers
// ---------------------------------------------------------------------------

export async function saveUsers(rawInput: unknown) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) {
    return saveUsersOutput.parse({
      ok: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: ctx.error,
    });
  }

  const input = saveUsersInput.parse(rawInput);

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      if (input.creates.length > 0) {
        const newRows = input.creates.map((c) => ({
          id: c.id,
          workspaceId: ctx.workspaceId,
          employeeId: c.employeeId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          orgId: c.orgId,
          position: c.position,
          jobTitle: c.jobTitle,
          status: c.status,
          isOutsourced: c.isOutsourced,
          employmentType: "internal" as const,
          updatedBy: ctx.userId,
        }));
        const ins = await tx.insert(user).values(newRows).returning({ id: user.id });
        inserted = ins.length;

        if (ins.length > 0) {
          await tx.insert(auditLog).values(
            ins.map((row, i) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "user.create",
              resourceType: "user",
              resourceId: row.id,
              details: {
                employeeId: newRows[i]!.employeeId,
                name: newRows[i]!.name,
              } as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        const before = await tx
          .select({
            name: user.name,
            email: user.email,
            status: user.status,
            orgId: user.orgId,
            position: user.position,
            jobTitle: user.jobTitle,
            phone: user.phone,
            isOutsourced: user.isOutsourced,
          })
          .from(user)
          .where(
            and(eq(user.id, u.id), eq(user.workspaceId, ctx.workspaceId)),
          )
          .limit(1);

        if (before.length === 0) continue;

        const [row] = await tx
          .update(user)
          .set({
            ...(u.name !== undefined ? { name: u.name } : {}),
            ...(u.email !== undefined ? { email: u.email } : {}),
            ...(u.phone !== undefined ? { phone: u.phone } : {}),
            ...(u.orgId !== undefined ? { orgId: u.orgId } : {}),
            ...(u.position !== undefined ? { position: u.position } : {}),
            ...(u.jobTitle !== undefined ? { jobTitle: u.jobTitle } : {}),
            ...(u.status !== undefined ? { status: u.status } : {}),
            ...(u.isOutsourced !== undefined
              ? { isOutsourced: u.isOutsourced }
              : {}),
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(user.id, u.id), eq(user.workspaceId, ctx.workspaceId)),
          )
          .returning({ id: user.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "user.update",
            resourceType: "user",
            resourceId: row.id,
            details: { before: before[0], after: u } as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(user)
          .where(
            and(
              inArray(user.id, input.deletes),
              eq(user.workspaceId, ctx.workspaceId),
            ),
          )
          .returning({ id: user.id });
        deleted = removed.length;

        if (removed.length > 0) {
          await tx.insert(auditLog).values(
            removed.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "user.delete",
              resourceType: "user",
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
    return saveUsersOutput.parse({
      ok: false,
      inserted,
      updated,
      deleted,
      error: message,
    });
  }

  return saveUsersOutput.parse({ ok: true, inserted, updated, deleted });
}
