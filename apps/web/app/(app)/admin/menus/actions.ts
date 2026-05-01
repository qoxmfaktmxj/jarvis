"use server";
/**
 * apps/web/app/(app)/admin/menus/actions.ts
 *
 * 메뉴 관리(/admin/menus) server actions — menu_item 마스터 + menu_permission 디테일.
 *
 * 권한: ADMIN_ALL.
 * 감사:
 *   admin.menu.{create,update,delete}
 *   admin.menu_permission.{add,remove}
 *
 * 패턴 출처: apps/web/app/(app)/admin/codes/actions.ts.
 *
 * Cross-workspace guard:
 *   - menu_item 은 workspace_id 컬럼이 있으므로 직접 비교.
 *   - permission 테이블은 workspace-agnostic (global resource:action) 이므로
 *     menu_permission 행은 menu_item.workspaceId 만 검증한다.
 */
import { cookies, headers } from "next/headers";
import { and, asc, count, eq, ilike, inArray, sql, isNull } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, menuItem, menuPermission, permission } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listMenusInput,
  listMenusOutput,
  saveMenusInput,
  saveMenusOutput,
  listMenuPermissionsInput,
  listMenuPermissionsOutput,
  saveMenuPermissionsInput,
  saveMenuPermissionsOutput,
  menuRow,
  menuPermissionRow,
  type MenuRow,
  type MenuPermissionRow,
} from "@jarvis/shared/validation/admin/menu";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror admin/codes/actions.ts)
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
// listMenus
// ---------------------------------------------------------------------------
export async function listMenus(rawInput: z.input<typeof listMenusInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listMenusInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  // self-join alias for parent.code lookup
  const parentItem = alias(menuItem, "parent_item");

  const qFilter = input.q ? ilike(menuItem.code, `%${input.q}%`) : undefined;
  const qLabelFilter = input.qLabel ? ilike(menuItem.label, `%${input.qLabel}%`) : undefined;
  const kindFilter = input.kind ? eq(menuItem.kind, input.kind) : undefined;

  // parentCode filter:
  //   "__root__" → parentId IS NULL
  //   "<code>" → parentItem.code = code
  //   undefined → no filter
  const parentFilter =
    input.parentCode === "__root__"
      ? isNull(menuItem.parentId)
      : input.parentCode
        ? eq(parentItem.code, input.parentCode)
        : undefined;

  const baseFilters = and(
    eq(menuItem.workspaceId, ctx.workspaceId),
    qFilter,
    qLabelFilter,
    kindFilter,
    parentFilter,
  );

  // permCnt: correlated subquery
  const permCntExpr = sql<number>`(SELECT COUNT(*)::int FROM ${menuPermission} WHERE ${menuPermission.menuItemId} = ${menuItem.id})`;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: menuItem.id,
        code: menuItem.code,
        kind: menuItem.kind,
        parentCode: parentItem.code,
        label: menuItem.label,
        icon: menuItem.icon,
        routePath: menuItem.routePath,
        sortOrder: menuItem.sortOrder,
        description: menuItem.description,
        isVisible: menuItem.isVisible,
        badge: menuItem.badge,
        keywords: menuItem.keywords,
        permCnt: permCntExpr,
      })
      .from(menuItem)
      .leftJoin(parentItem, eq(menuItem.parentId, parentItem.id))
      .where(baseFilters)
      // parentCode NULLS FIRST → sortOrder ASC → code ASC. Approximates the tree visually.
      .orderBy(
        sql`${parentItem.code} ASC NULLS FIRST`,
        asc(menuItem.sortOrder),
        asc(menuItem.code),
      )
      .limit(input.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(menuItem)
      .leftJoin(parentItem, eq(menuItem.parentId, parentItem.id))
      .where(baseFilters),
  ]);

  return listMenusOutput.parse({
    rows: rows.map((r) =>
      menuRow.parse({
        id: r.id,
        code: r.code,
        kind: r.kind,
        parentCode: r.parentCode ?? null,
        label: r.label,
        icon: r.icon ?? null,
        routePath: r.routePath ?? null,
        sortOrder: r.sortOrder,
        description: r.description ?? null,
        isVisible: r.isVisible,
        badge: r.badge ?? null,
        // Convert text[] → comma-separated string for grid editing UX.
        // null/empty → null so the cell renders empty.
        keywords:
          Array.isArray(r.keywords) && r.keywords.length > 0
            ? r.keywords.join(", ")
            : null,
        permCnt: Number(r.permCnt ?? 0),
      } satisfies MenuRow),
    ),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

/**
 * Parse a comma-separated keyword string into a `text[]` for DB write.
 *
 * - `null` / `undefined` → `null` (no change to keywords; or "clear" if part
 *   of an explicit patch). Keeps Drizzle from sending `'{NULL}'` etc.
 * - empty / whitespace-only string → `null` (treat blank input as cleared)
 * - otherwise → split on `,`, trim each, drop empties, dedupe (case-insensitive
 *   prefix match using lower-case key) so duplicate user input doesn't grow
 *   the array on every save.
 */
function parseKeywordsString(
  raw: string | null | undefined,
): string[] | null {
  if (raw === null || raw === undefined) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// saveMenus
// ---------------------------------------------------------------------------
export async function saveMenus(rawInput: z.input<typeof saveMenusInput>) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveMenusOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveMenusInput.parse(rawInput);
  const workspaceId = ctx.workspaceId;
  const userId = ctx.userId;
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // Resolve parentCode → parentId helper (per workspace).
      async function resolveParentId(
        parentCode: string | null | undefined,
      ): Promise<{ ok: true; id: string | null } | { ok: false; reason: string }> {
        if (parentCode === null || parentCode === undefined || parentCode === "") {
          return { ok: true, id: null };
        }
        const [p] = await tx
          .select({ id: menuItem.id })
          .from(menuItem)
          .where(
            and(
              eq(menuItem.workspaceId, workspaceId),
              eq(menuItem.code, parentCode),
            ),
          )
          .limit(1);
        if (!p) return { ok: false, reason: `상위 메뉴 코드를 찾을 수 없습니다: ${parentCode}` };
        return { ok: true, id: p.id };
      }

      // ---- CREATE ----
      for (const c of input.creates) {
        const parent = await resolveParentId(c.parentCode);
        if (!parent.ok) {
          errors.push({ id: c.id, message: parent.reason });
          continue;
        }
        const keywordsArr = parseKeywordsString(c.keywords);
        await tx.insert(menuItem).values({
          id: c.id,
          workspaceId,
          parentId: parent.id,
          code: c.code,
          kind: c.kind,
          label: c.label,
          description: c.description ?? null,
          icon: c.icon ?? null,
          routePath: c.routePath ?? null,
          sortOrder: c.sortOrder,
          isVisible: c.isVisible,
          badge: c.badge ?? null,
          keywords: keywordsArr,
        });
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.menu.create",
          resourceType: "menu_item",
          resourceId: c.id,
          details: {
            code: c.code,
            kind: c.kind,
            label: c.label,
            badge: c.badge ?? null,
            keywords: keywordsArr,
          } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // Verify the row belongs to this workspace.
        const [existing] = await tx
          .select({ id: menuItem.id, workspaceId: menuItem.workspaceId })
          .from(menuItem)
          .where(eq(menuItem.id, u.id))
          .limit(1);
        if (!existing || existing.workspaceId !== workspaceId) {
          errors.push({ id: u.id, message: "수정 대상이 워크스페이스에 존재하지 않습니다" });
          continue;
        }
        // Resolve parentCode → parentId if patch contains it.
        const { id: _id, parentCode, ...rest } = u.patch;
        const patch: Record<string, unknown> = { ...rest };
        if ("parentCode" in u.patch) {
          const parent = await resolveParentId(parentCode ?? null);
          if (!parent.ok) {
            errors.push({ id: u.id, message: parent.reason });
            continue;
          }
          patch.parentId = parent.id;
        }
        // keywords (boundary representation: comma-string) → text[] for DB.
        // We only convert when the patch explicitly carries the field so we
        // don't accidentally clear an unrelated row's keywords.
        if ("keywords" in u.patch) {
          patch.keywords = parseKeywordsString(
            u.patch.keywords as string | null | undefined,
          );
        }
        if (Object.keys(patch).length > 0) {
          await tx
            .update(menuItem)
            .set(patch)
            .where(
              and(
                eq(menuItem.id, u.id),
                eq(menuItem.workspaceId, workspaceId),
              ),
            );
        }
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.menu.update",
          resourceType: "menu_item",
          resourceId: u.id,
          details: { ...patch, parentCode: parentCode ?? undefined } as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const condemned = await tx
          .select({
            id: menuItem.id,
            code: menuItem.code,
            label: menuItem.label,
            workspaceId: menuItem.workspaceId,
          })
          .from(menuItem)
          .where(inArray(menuItem.id, input.deletes));

        const allowed = condemned.filter((r) => r.workspaceId === workspaceId);
        const allowedIds = allowed.map((r) => r.id);
        const denied = input.deletes.filter((id) => !allowedIds.includes(id));
        for (const id of denied) {
          errors.push({ id, message: "삭제 대상이 워크스페이스에 존재하지 않습니다" });
        }

        if (allowedIds.length > 0) {
          // menu_permission has ON DELETE CASCADE on menu_item_id, so its rows go away automatically.
          await tx.delete(menuItem).where(inArray(menuItem.id, allowedIds));

          for (const row of allowed) {
            await tx.insert(auditLog).values({
              workspaceId,
              userId,
              action: "admin.menu.delete",
              resourceType: "menu_item",
              resourceId: row.id,
              details: { code: row.code, label: row.label } as Record<string, unknown>,
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

  return saveMenusOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ---------------------------------------------------------------------------
// listMenuPermissions
// ---------------------------------------------------------------------------

/**
 * Korean label / description for each permission code.
 *
 * `permission` 테이블에는 description 컬럼이 없으므로 (resource, action)만 보유.
 * 디테일 그리드에서 사람이 읽을 한글 설명이 필요해 여기서 dictionary를 들고 있다.
 * `PERMISSIONS` 상수에 새 키가 추가되면 이 딕셔너리에도 추가해 줘야 한다.
 */
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "knowledge:read": "지식 페이지 조회",
  "knowledge:create": "지식 페이지 생성",
  "knowledge:update": "지식 페이지 수정",
  "knowledge:delete": "지식 페이지 삭제",
  "knowledge:review": "지식 검토 (RESTRICTED 위키 접근)",
  "knowledge:admin": "지식 관리자",
  "project:read": "프로젝트 조회",
  "project:create": "프로젝트 생성",
  "project:update": "프로젝트 수정",
  "project:delete": "프로젝트 삭제",
  "project.access:secret": "프로젝트 시크릿 접근",
  "additional-dev:read": "추가개발 조회",
  "additional-dev:create": "추가개발 생성",
  "additional-dev:update": "추가개발 수정",
  "additional-dev:delete": "추가개발 삭제",
  "contractor:read": "외부 인력 조회",
  "contractor:admin": "외부 인력 관리",
  "admin:users:read": "사용자 조회",
  "admin:users:write": "사용자 관리",
  "admin:audit:read": "감사 로그 조회",
  "admin:all": "관리자 전체 권한",
  "files:write": "파일 업로드",
  "graph:read": "지식 그래프 조회",
  "graph:build": "지식 그래프 빌드",
  "notice:read": "공지 조회",
  "notice:create": "공지 작성",
  "notice:update": "공지 수정",
  "notice:delete": "공지 삭제",
  "sales:all": "영업관리 전체 권한",
};

export async function listMenuPermissions(
  rawInput: z.input<typeof listMenuPermissionsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };

  const input = listMenuPermissionsInput.parse(rawInput);

  // Cross-workspace guard: confirm the menu_item belongs to this workspace.
  const [owner] = await db
    .select({ id: menuItem.id })
    .from(menuItem)
    .where(
      and(
        eq(menuItem.id, input.menuId),
        eq(menuItem.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!owner) return { ok: false as const, error: "Not found", rows: [] };

  // All permissions LEFT JOINed with menu_permission for this menu.
  const rows = await db
    .select({
      permissionId: permission.id,
      resource: permission.resource,
      action: permission.action,
      menuItemId: menuPermission.menuItemId,
    })
    .from(permission)
    .leftJoin(
      menuPermission,
      and(
        eq(menuPermission.permissionId, permission.id),
        eq(menuPermission.menuItemId, input.menuId),
      ),
    )
    .orderBy(asc(permission.resource), asc(permission.action));

  return listMenuPermissionsOutput.parse({
    rows: rows.map<MenuPermissionRow>((r) => {
      const code = `${r.resource}:${r.action}`;
      return menuPermissionRow.parse({
        permissionId: r.permissionId,
        permissionCode: code,
        permissionDescription: PERMISSION_DESCRIPTIONS[code] ?? null,
        assigned: r.menuItemId !== null,
      });
    }),
  });
}

// ---------------------------------------------------------------------------
// saveMenuPermissions
// ---------------------------------------------------------------------------
export async function saveMenuPermissions(
  rawInput: z.input<typeof saveMenuPermissionsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveMenuPermissionsOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveMenuPermissionsInput.parse(rawInput);
  const workspaceId = ctx.workspaceId;
  const userId = ctx.userId;
  const added: string[] = [];
  const removed: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // Cross-workspace guard.
      const [owner] = await tx
        .select({ id: menuItem.id })
        .from(menuItem)
        .where(
          and(
            eq(menuItem.id, input.menuId),
            eq(menuItem.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!owner) {
        errors.push({ message: "메뉴가 워크스페이스에 존재하지 않습니다" });
        return;
      }

      // ---- REMOVE ----
      if (input.removed.length > 0) {
        await tx
          .delete(menuPermission)
          .where(
            and(
              eq(menuPermission.menuItemId, input.menuId),
              inArray(menuPermission.permissionId, input.removed),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.menu_permission.remove",
          resourceType: "menu_permission",
          resourceId: input.menuId,
          details: {
            menuId: input.menuId,
            permissionIds: input.removed,
          } as Record<string, unknown>,
          success: true,
        });
        removed.push(...input.removed);
      }

      // ---- ADD ----
      if (input.assigned.length > 0) {
        // bulk insert with onConflictDoNothing in case the row already exists.
        await tx
          .insert(menuPermission)
          .values(
            input.assigned.map((permissionId) => ({
              menuItemId: input.menuId,
              permissionId,
            })),
          )
          .onConflictDoNothing();
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.menu_permission.add",
          resourceType: "menu_permission",
          resourceId: input.menuId,
          details: {
            menuId: input.menuId,
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

  return saveMenuPermissionsOutput.parse({
    ok: errors.length === 0,
    added,
    removed,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// expose row schemas for client consumers if useful
export { menuRow, menuPermissionRow };
