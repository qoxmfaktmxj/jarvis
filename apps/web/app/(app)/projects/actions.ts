"use server";
/**
 * apps/web/app/(app)/projects/actions.ts
 *
 * /projects DataGrid server actions.
 *
 * Permissions:
 *   - list:     PROJECT_READ
 *   - save:     PROJECT_CREATE for creates, PROJECT_UPDATE for updates,
 *               PROJECT_DELETE for deletes
 *
 * Schema constraint: `project.workspace_company_unique` enforces one project
 * per (workspaceId, companyId) — duplicate creates surface as DUPLICATE error.
 */
import { cookies, headers } from "next/headers";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, project } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import {
  listProjectsInput,
  listProjectsOutput,
  saveProjectsInput,
  saveProjectsOutput,
  type ListProjectsOutput,
  type SaveProjectsOutput,
} from "@jarvis/shared/validation/project";
import { listProjectsForGrid } from "@/lib/queries/projects";
import type { z } from "zod";

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

async function resolveProjectContext(requiredPermission: string) {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, requiredPermission)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
    session,
  };
}

// ---------------------------------------------------------------------------
// listProjectsAction — server action wrapper for Grid client reload
// ---------------------------------------------------------------------------
export async function listProjectsAction(
  rawInput: z.input<typeof listProjectsInput>,
): Promise<ListProjectsOutput | { error: string; rows: never[]; total: 0 }> {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) {
    return { error: ctx.error, rows: [], total: 0 } as const;
  }
  const input = listProjectsInput.parse(rawInput);
  const { rows, total } = await listProjectsForGrid({
    workspaceId: ctx.workspaceId,
    q: input.q,
    status: input.status,
    connectType: input.connectType,
    page: input.page,
    limit: input.limit,
  });
  return listProjectsOutput.parse({ rows, total });
}

// ---------------------------------------------------------------------------
// saveProjects — batch creates/updates/deletes in a transaction + audit
// ---------------------------------------------------------------------------
export async function saveProjects(
  rawInput: z.input<typeof saveProjectsInput>,
): Promise<SaveProjectsOutput> {
  const ctxRead = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctxRead.ok) {
    return saveProjectsOutput.parse({
      ok: false,
      errors: [{ message: ctxRead.error }],
    });
  }
  const session = ctxRead.session;

  const input = saveProjectsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  // Permission gating per mutation kind
  if (input.creates.length > 0 && !hasPermission(session, PERMISSIONS.PROJECT_CREATE)) {
    return saveProjectsOutput.parse({
      ok: false,
      errors: [{ message: "Forbidden: PROJECT_CREATE required" }],
    });
  }
  if (input.updates.length > 0 && !hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return saveProjectsOutput.parse({
      ok: false,
      errors: [{ message: "Forbidden: PROJECT_UPDATE required" }],
    });
  }
  if (input.deletes.length > 0 && !hasPermission(session, PERMISSIONS.PROJECT_DELETE)) {
    return saveProjectsOutput.parse({
      ok: false,
      errors: [{ message: "Forbidden: PROJECT_DELETE required" }],
    });
  }

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        const [row] = await tx
          .insert(project)
          .values({
            workspaceId: ctxRead.workspaceId,
            companyId: c.companyId,
            name: c.name,
            status: c.status ?? "active",
            ownerId: c.ownerId ?? ctxRead.userId,
            description: c.description ?? null,
            prodConnectType: c.prodConnectType ?? null,
            prodDomainUrl: c.prodDomainUrl ?? null,
            devConnectType: c.devConnectType ?? null,
            devDomainUrl: c.devDomainUrl ?? null,
          })
          .returning({ id: project.id });
        if (row) {
          created.push(row.id);
          await writeAuditLog(tx, auditLog, {
            workspaceId: ctxRead.workspaceId,
            userId: ctxRead.userId,
            action: "project.create",
            resourceType: "project",
            resourceId: row.id,
            details: { companyId: c.companyId, name: c.name },
            success: true,
          });
        }
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        const patch = u.patch;
        const [before] = await tx
          .select({
            companyId: project.companyId,
            name: project.name,
            status: project.status,
            ownerId: project.ownerId,
            description: project.description,
            prodConnectType: project.prodConnectType,
            prodDomainUrl: project.prodDomainUrl,
            devConnectType: project.devConnectType,
            devDomainUrl: project.devDomainUrl,
          })
          .from(project)
          .where(
            and(
              eq(project.id, u.id),
              eq(project.workspaceId, ctxRead.workspaceId),
            ),
          )
          .limit(1);

        // Row-level pre-check for `project_workspace_company_unique`:
        // when patch.companyId changes the FK, surface a DUPLICATE error
        // pinned to this specific id rather than aborting the whole batch
        // with an opaque catch-block error.
        if (
          patch.companyId !== undefined &&
          before &&
          patch.companyId !== before.companyId
        ) {
          const [clash] = await tx
            .select({ id: project.id })
            .from(project)
            .where(
              and(
                eq(project.workspaceId, ctxRead.workspaceId),
                eq(project.companyId, patch.companyId),
                ne(project.id, u.id),
              ),
            )
            .limit(1);
          if (clash) {
            errors.push({
              id: u.id,
              message: `DUPLICATE: company already has a project (workspace_company_unique)`,
            });
            continue;
          }
        }

        await tx
          .update(project)
          .set({
            ...patch,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(project.id, u.id),
              eq(project.workspaceId, ctxRead.workspaceId),
            ),
          );

        await writeAuditLog(tx, auditLog, {
          workspaceId: ctxRead.workspaceId,
          userId: ctxRead.userId,
          action: "project.update",
          resourceType: "project",
          resourceId: u.id,
          before: before ?? undefined,
          after: patch,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const condemned = await tx
          .select({
            id: project.id,
            companyId: project.companyId,
            name: project.name,
          })
          .from(project)
          .where(
            and(
              eq(project.workspaceId, ctxRead.workspaceId),
              inArray(project.id, input.deletes),
            ),
          );

        await tx
          .delete(project)
          .where(
            and(
              eq(project.workspaceId, ctxRead.workspaceId),
              inArray(project.id, input.deletes),
            ),
          );

        const detailsById = new Map(condemned.map((r) => [r.id, r] as const));
        for (const id of input.deletes) {
          const row = detailsById.get(id);
          await writeAuditLog(tx, auditLog, {
            workspaceId: ctxRead.workspaceId,
            userId: ctxRead.userId,
            action: "project.delete",
            resourceType: "project",
            resourceId: id,
            details: row ? { companyId: row.companyId, name: row.name } : {},
            success: true,
          });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    let code = "SAVE_FAILED";
    if (message.toLowerCase().includes("unique")) code = "DUPLICATE";
    errors.push({ message: `${code}: ${message}` });
  }

  return saveProjectsOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
