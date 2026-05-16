"use server";
/**
 * apps/web/app/(app)/admin/roles/actions.ts
 *
 * 역할 관리(/admin/roles) server actions — role 마스터 + role_permission 디테일.
 *
 * 권한: ADMIN_ALL.
 * 감사:
 *   admin.role.{create,update,delete}
 *   admin.role_permission.{add,remove}
 *
 * 패턴 출처: apps/web/app/(app)/admin/menus/actions.ts.
 *
 * Cross-workspace guard:
 *   - role 은 workspace_id 컬럼이 있으므로 직접 비교.
 *   - permission 테이블은 workspace-agnostic (global resource:action).
 *   - role_permission 행은 role.workspaceId 로만 검증.
 */
import { cookies, headers } from "next/headers";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, permission, role, rolePermission } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listRolesInput,
  listRolesOutput,
  saveRolesInput,
  saveRolesOutput,
  listRolePermissionsInput,
  listRolePermissionsOutput,
  saveRolePermissionsInput,
  saveRolePermissionsOutput,
  roleRow,
  rolePermissionRow,
  type RoleRow,
  type RolePermissionRow,
} from "@jarvis/shared/validation/admin/role";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror admin/menus/actions.ts)
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
  };
}

// ---------------------------------------------------------------------------
// Permission descriptions (Korean labels for the detail grid)
// ---------------------------------------------------------------------------
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "knowledge:read": "지식 페이지 조회",
  "knowledge:admin": "지식 관리자",
  "project:read": "프로젝트 조회",
  "project:admin": "프로젝트 관리자",
  "notice:read": "공지 조회",
  "notice:admin": "공지 관리자",
  "maintenance:read": "유지보수 조회",
  "maintenance:admin": "유지보수 관리자",
  "infra:read": "인프라 조회",
  "infra:admin": "인프라 관리자",
  "doc-num:read": "문서번호 조회",
  "doc-num:admin": "문서번호 관리자",
  "faq:read": "FAQ 조회",
  "faq:admin": "FAQ 관리자",
  "graph:read": "지식 그래프 조회",
  "graph:admin": "지식 그래프 관리자",
  "user:read": "사용자 조회",
  "user:admin": "사용자 관리자",
  "schedule:read": "일정 조회",
  "schedule:admin": "일정 관리자",
  "sales:read": "영업관리 조회",
  "sales:admin": "영업관리 관리자",
  "admin:all": "관리자 전체 권한",
};

// ---------------------------------------------------------------------------
// listRoles
// ---------------------------------------------------------------------------
export async function listRoles(rawInput: z.input<typeof listRolesInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) {
    return { ok: false as const, error: ctx.error, rows: [], total: 0 };
  }

  const input = listRolesInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const qFilter = input.q
    ? or(
        ilike(role.code, `%${input.q}%`),
        ilike(role.name, `%${input.q}%`),
      )
    : undefined;

  const baseFilters = and(
    eq(role.workspaceId, ctx.workspaceId),
    qFilter,
  );

  // permCount: correlated subquery
  const permCountExpr = sql<number>`(SELECT COUNT(*)::int FROM ${rolePermission} WHERE ${rolePermission.roleId} = ${role.id})`;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permCount: permCountExpr,
      })
      .from(role)
      .where(baseFilters)
      .orderBy(asc(role.code))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(role).where(baseFilters),
  ]);

  return listRolesOutput.parse({
    rows: rows.map((r) =>
      roleRow.parse({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        isSystem: r.isSystem,
        permCount: Number(r.permCount ?? 0),
      } satisfies RoleRow),
    ),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveRoles
// ---------------------------------------------------------------------------
export async function saveRoles(rawInput: z.input<typeof saveRolesInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveRolesOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveRolesInput.parse(rawInput);
  const workspaceId = ctx.workspaceId;
  const userId = ctx.userId;
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        await tx.insert(role).values({
          id: c.id,
          workspaceId,
          code: c.code,
          name: c.name,
          description: c.description ?? null,
          isSystem: c.isSystem ?? false,
        });
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.role.create",
          resourceType: "role",
          resourceId: c.id,
          details: { code: c.code, name: c.name } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // Verify row belongs to this workspace.
        const [existing] = await tx
          .select({ id: role.id, workspaceId: role.workspaceId, isSystem: role.isSystem })
          .from(role)
          .where(eq(role.id, u.id))
          .limit(1);
        if (!existing || existing.workspaceId !== workspaceId) {
          errors.push({ id: u.id, message: "수정 대상이 워크스페이스에 존재하지 않습니다" });
          continue;
        }
        const patch: Record<string, unknown> = { ...u.patch };
        if (Object.keys(patch).length > 0) {
          await tx
            .update(role)
            .set(patch)
            .where(and(eq(role.id, u.id), eq(role.workspaceId, workspaceId)));
        }
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.role.update",
          resourceType: "role",
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
            id: role.id,
            code: role.code,
            name: role.name,
            workspaceId: role.workspaceId,
            isSystem: role.isSystem,
          })
          .from(role)
          .where(inArray(role.id, input.deletes));

        const allowed = condemned.filter(
          (r) => r.workspaceId === workspaceId && !r.isSystem,
        );
        const allowedIds = allowed.map((r) => r.id);

        // 시스템 역할 삭제 시도 거부
        const systemBlocked = condemned.filter((r) => r.isSystem);
        for (const r of systemBlocked) {
          errors.push({ id: r.id, message: `시스템 역할은 삭제할 수 없습니다: ${r.code}` });
        }

        const denied = input.deletes.filter(
          (id) => !allowedIds.includes(id) && !systemBlocked.some((r) => r.id === id),
        );
        for (const id of denied) {
          errors.push({ id, message: "삭제 대상이 워크스페이스에 존재하지 않습니다" });
        }

        if (allowedIds.length > 0) {
          // role_permission has ON DELETE CASCADE on role_id.
          await tx.delete(role).where(inArray(role.id, allowedIds));

          for (const r of allowed) {
            await tx.insert(auditLog).values({
              workspaceId,
              userId,
              action: "admin.role.delete",
              resourceType: "role",
              resourceId: r.id,
              details: { code: r.code, name: r.name } as Record<string, unknown>,
              success: true,
            });
          }
          deleted.push(...allowedIds);
        }
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveRolesOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ---------------------------------------------------------------------------
// listRolePermissions
// ---------------------------------------------------------------------------
export async function listRolePermissions(
  rawInput: z.input<typeof listRolePermissionsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };

  const input = listRolePermissionsInput.parse(rawInput);

  // Cross-workspace guard: confirm role belongs to this workspace.
  const [owner] = await db
    .select({ id: role.id })
    .from(role)
    .where(and(eq(role.id, input.roleId), eq(role.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!owner) return { ok: false as const, error: "Not found", rows: [] };

  // All permissions LEFT JOINed with role_permission for this role.
  const rows = await db
    .select({
      permissionId: permission.id,
      resource: permission.resource,
      action: permission.action,
      roleId: rolePermission.roleId,
    })
    .from(permission)
    .leftJoin(
      rolePermission,
      and(
        eq(rolePermission.permissionId, permission.id),
        eq(rolePermission.roleId, input.roleId),
      ),
    )
    .orderBy(asc(permission.resource), asc(permission.action));

  return listRolePermissionsOutput.parse({
    rows: rows.map<RolePermissionRow>((r) => {
      const code = `${r.resource}:${r.action}`;
      return rolePermissionRow.parse({
        permissionId: r.permissionId,
        permissionCode: code,
        permissionDescription: PERMISSION_DESCRIPTIONS[code] ?? null,
        assigned: r.roleId !== null,
      });
    }),
  });
}

// ---------------------------------------------------------------------------
// saveRolePermissions
// ---------------------------------------------------------------------------
export async function saveRolePermissions(
  rawInput: z.input<typeof saveRolePermissionsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveRolePermissionsOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveRolePermissionsInput.parse(rawInput);
  const workspaceId = ctx.workspaceId;
  const userId = ctx.userId;
  const added: string[] = [];
  const removed: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // Cross-workspace guard.
      const [owner] = await tx
        .select({ id: role.id, code: role.code, isSystem: role.isSystem })
        .from(role)
        .where(and(eq(role.id, input.roleId), eq(role.workspaceId, workspaceId)))
        .limit(1);
      if (!owner) {
        errors.push({ message: "역할이 워크스페이스에 존재하지 않습니다" });
        return;
      }

      // 시스템 역할(ADMIN/MANAGER/MEMBER/YEAREND) 권한 매핑은 불변.
      // 변경 허용 시 ADMIN role에서 admin:all 제거 → 영구 lockout 위험
      // (codex P1 finding 2026-05-16). 권한 분포는 SoT(ROLE_PERMISSIONS)로 관리.
      if (owner.isSystem) {
        errors.push({
          message: `시스템 역할(${owner.code})의 권한 매핑은 변경할 수 없습니다. ROLE_PERMISSIONS SoT 수정 후 마이그레이션 실행 필요.`,
        });
        return;
      }

      // ---- REMOVE ----
      if (input.removed.length > 0) {
        await tx
          .delete(rolePermission)
          .where(
            and(
              eq(rolePermission.roleId, input.roleId),
              inArray(rolePermission.permissionId, input.removed),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.role_permission.remove",
          resourceType: "role_permission",
          resourceId: input.roleId,
          details: {
            roleId: input.roleId,
            permissionIds: input.removed,
          } as Record<string, unknown>,
          success: true,
        });
        removed.push(...input.removed);
      }

      // ---- ADD ----
      if (input.assigned.length > 0) {
        await tx
          .insert(rolePermission)
          .values(
            input.assigned.map((permissionId) => ({
              roleId: input.roleId,
              permissionId,
            })),
          )
          .onConflictDoNothing();
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.role_permission.add",
          resourceType: "role_permission",
          resourceId: input.roleId,
          details: {
            roleId: input.roleId,
            permissionIds: input.assigned,
          } as Record<string, unknown>,
          success: true,
        });
        added.push(...input.assigned);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveRolePermissionsOutput.parse({
    ok: errors.length === 0,
    added,
    removed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
