"use server";
/**
 * apps/web/app/(app)/infra/actions.ts
 *
 * 인프라구성관리 (Plan 5) server actions.
 *
 * 권한 모델 (Plan 5 confirmed):
 *   - 조회 (saveInfraSystems 진입 차단용 baseline): INFRA_READ
 *   - 생성/수정/삭제: INFRA_WRITE
 *   - linkRunbook (wiki page 연결): INFRA_WRITE
 *   - INFRA_ADMIN은 ADMIN_ALL 자동 포함 (sensitivity 격상 등 별도 운영용)
 *
 * Sensitivity: row 메타데이터로만 (Plan 5 confirmed: "RBAC INFRA_*로 통제").
 *
 * 감사: infra.system.{create,update,delete,linkRunbook}
 */
import { cookies, headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, infraSystem, wikiPageIndex } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listInfraSystemsInput,
  listInfraSystemsOutput,
  saveInfraSystemsInput,
  saveInfraSystemsOutput,
  linkRunbookInput,
  linkRunbookOutput,
  type ListInfraSystemsOutput,
  type SaveInfraSystemsOutput,
  type LinkRunbookOutput,
} from "@jarvis/shared/validation/infra/system";
import { listInfraSystems as listInfraSystemsQuery } from "@/lib/queries/infra-system";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror admin/infra/licenses/actions.ts)
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

async function resolveInfraContext(requiredPermission: string) {
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
  };
}

// ---------------------------------------------------------------------------
// listInfraSystems — server action wrapper for Grid client reload
// ---------------------------------------------------------------------------
export async function listInfraSystems(
  rawInput: z.input<typeof listInfraSystemsInput>,
): Promise<
  ListInfraSystemsOutput | { error: string; rows: never[]; total: 0 }
> {
  const ctx = await resolveInfraContext(PERMISSIONS.INFRA_READ);
  if (!ctx.ok) {
    return { error: ctx.error, rows: [], total: 0 } as const;
  }
  const input = listInfraSystemsInput.parse(rawInput);
  const { rows, total } = await listInfraSystemsQuery(ctx.workspaceId, {
    page: input.page,
    limit: input.limit,
    q: input.q,
    companyId: input.companyId,
    envType: input.envType,
    dbType: input.dbType,
  });
  return listInfraSystemsOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.companyName,
      systemName: r.systemName,
      envType: r.envType,
      domainAddr: r.domainAddr,
      port: r.port,
      dbType: r.dbType,
      dbVersion: r.dbVersion,
      osType: r.osType,
      osVersion: r.osVersion,
      connectMethod: r.connectMethod,
      deployMethod: r.deployMethod,
      deployFolder: r.deployFolder,
      ownerName: r.ownerName,
      ownerContact: r.ownerContact,
      wikiPageId: r.wikiPageId,
      wikiPageRouteKey: r.wikiPageRouteKey,
      wikiPageTitle: r.wikiPageTitle,
      note: r.note,
      sensitivity: r.sensitivity,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdBy: r.createdBy,
      updatedBy: r.updatedBy,
    })),
    total,
  });
}

// ---------------------------------------------------------------------------
// saveInfraSystems — batch creates/updates/deletes in a transaction + audit
// ---------------------------------------------------------------------------
export async function saveInfraSystems(
  rawInput: z.input<typeof saveInfraSystemsInput>,
): Promise<SaveInfraSystemsOutput> {
  const ctx = await resolveInfraContext(PERMISSIONS.INFRA_WRITE);
  if (!ctx.ok) {
    return saveInfraSystemsOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });
  }

  const input = saveInfraSystemsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        const [row] = await tx
          .insert(infraSystem)
          .values({
            workspaceId: ctx.workspaceId,
            companyId: c.companyId,
            systemName: c.systemName,
            envType: c.envType ?? null,
            domainAddr: c.domainAddr ?? null,
            port: c.port ?? null,
            dbType: c.dbType ?? null,
            dbVersion: c.dbVersion ?? null,
            osType: c.osType ?? null,
            osVersion: c.osVersion ?? null,
            connectMethod: c.connectMethod ?? null,
            deployMethod: c.deployMethod ?? null,
            deployFolder: c.deployFolder ?? null,
            ownerName: c.ownerName ?? null,
            ownerContact: c.ownerContact ?? null,
            wikiPageId: c.wikiPageId ?? null,
            note: c.note ?? null,
            sensitivity: c.sensitivity ?? "INTERNAL",
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({ id: infraSystem.id });
        if (row) {
          created.push(row.id);
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "infra.system.create",
            resourceType: "infra_system",
            resourceId: row.id,
            details: {
              companyId: c.companyId,
              systemName: c.systemName,
              envType: c.envType,
            } as Record<string, unknown>,
            success: true,
          });
        }
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // patch는 이미 infraSystemUpdateInput에서 audit fields(id/createdAt/
        // updatedAt/createdBy/updatedBy)가 omit된 partial이므로 추가 분해 불필요.
        const patch = u.patch;
        await tx
          .update(infraSystem)
          .set({
            ...patch,
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(infraSystem.id, u.id),
              eq(infraSystem.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "infra.system.update",
          resourceType: "infra_system",
          resourceId: u.id,
          details: patch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const condemned = await tx
          .select({
            id: infraSystem.id,
            companyId: infraSystem.companyId,
            systemName: infraSystem.systemName,
            envType: infraSystem.envType,
          })
          .from(infraSystem)
          .where(
            and(
              eq(infraSystem.workspaceId, ctx.workspaceId),
              inArray(infraSystem.id, input.deletes),
            ),
          );

        await tx
          .delete(infraSystem)
          .where(
            and(
              eq(infraSystem.workspaceId, ctx.workspaceId),
              inArray(infraSystem.id, input.deletes),
            ),
          );

        const detailsById = new Map(
          condemned.map((r) => [r.id, r] as const),
        );
        for (const id of input.deletes) {
          const row = detailsById.get(id);
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "infra.system.delete",
            resourceType: "infra_system",
            resourceId: id,
            details: row
              ? ({
                  companyId: row.companyId,
                  systemName: row.systemName,
                  envType: row.envType,
                } as Record<string, unknown>)
              : ({} as Record<string, unknown>),
            success: true,
          });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({
      message: e instanceof Error ? e.message : "save failed",
    });
  }

  return saveInfraSystemsOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ---------------------------------------------------------------------------
// linkRunbook — link/unlink an infra_system to a wiki_page_index row
// ---------------------------------------------------------------------------
export async function linkRunbook(
  rawInput: z.input<typeof linkRunbookInput>,
): Promise<LinkRunbookOutput> {
  const ctx = await resolveInfraContext(PERMISSIONS.INFRA_WRITE);
  if (!ctx.ok) {
    return linkRunbookOutput.parse({ ok: false, wikiPageId: null });
  }

  const input = linkRunbookInput.parse(rawInput);

  // wikiPageId가 null이 아니면 동일 workspace 페이지인지 검증.
  if (input.wikiPageId) {
    const [page] = await db
      .select({ id: wikiPageIndex.id })
      .from(wikiPageIndex)
      .where(
        and(
          eq(wikiPageIndex.id, input.wikiPageId),
          eq(wikiPageIndex.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);
    if (!page) {
      return linkRunbookOutput.parse({ ok: false, wikiPageId: null });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(infraSystem)
      .set({
        wikiPageId: input.wikiPageId,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(infraSystem.id, input.id),
          eq(infraSystem.workspaceId, ctx.workspaceId),
        ),
      );
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "infra.system.linkRunbook",
      resourceType: "infra_system",
      resourceId: input.id,
      details: { wikiPageId: input.wikiPageId } as Record<string, unknown>,
      success: true,
    });
  });

  return linkRunbookOutput.parse({
    ok: true,
    wikiPageId: input.wikiPageId,
  });
}
