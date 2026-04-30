/**
 * packages/db/seed/permissions.ts
 *
 * RBAC seed: bootstrap `permission` and `role_permission` tables from the
 * source-of-truth TypeScript constants in `@jarvis/shared/constants/permissions.ts`.
 *
 * Phase: rbac-menu-tree (Task 2/9). Plan:
 *   docs/superpowers/plans/2026-04-30-rbac-menu-tree.md
 *
 * Idempotent: relies on unique indexes added in migration 0049
 *   - permission_resource_action_unique (resource, action)
 *   - role_ws_code_unique (workspace_id, code)
 */
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { permission, role, rolePermission } from "../schema/index.js";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
} from "@jarvis/shared/constants/permissions";

function splitPermissionKey(key: string): { resource: string; action: string } {
  const idx = key.lastIndexOf(":");
  if (idx < 0) throw new Error(`Invalid permission key (no colon): ${key}`);
  return { resource: key.slice(0, idx), action: key.slice(idx + 1) };
}

/**
 * Seed all PERMISSIONS into the `permission` table.
 *
 * Returns a map from permission key (e.g. "knowledge:read") to its row id,
 * so callers can wire role_permission / menu_permission without re-querying.
 */
export async function seedPermissions(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();

  for (const key of Object.values(PERMISSIONS)) {
    const { resource, action } = splitPermissionKey(key);
    await db
      .insert(permission)
      .values({ resource, action })
      .onConflictDoNothing({ target: [permission.resource, permission.action] });

    const [row] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(and(eq(permission.resource, resource), eq(permission.action, action)))
      .limit(1);
    if (!row) throw new Error(`Failed to upsert permission: ${key}`);
    keyToId.set(key, row.id);
  }

  console.log(`[seed/permissions] seeded ${keyToId.size} permissions`);
  return keyToId;
}

/**
 * Seed `role_permission` links from ROLE_PERMISSIONS for every role in the
 * given workspace. Roles not present in DB are skipped silently.
 */
export async function seedRolePermissions(
  workspaceId: string,
  permKeyToId: Map<string, string>,
): Promise<void> {
  const allRoles = await db
    .select({ id: role.id, code: role.code })
    .from(role)
    .where(eq(role.workspaceId, workspaceId));

  let count = 0;
  for (const r of allRoles) {
    const perms: Permission[] = ROLE_PERMISSIONS[r.code.toUpperCase()] ?? [];
    for (const permKey of perms) {
      const permId = permKeyToId.get(permKey);
      if (!permId) {
        console.warn(
          `[seed/role-permissions] permission not found: ${permKey} for role ${r.code}`,
        );
        continue;
      }
      await db
        .insert(rolePermission)
        .values({ roleId: r.id, permissionId: permId })
        .onConflictDoNothing();
      count++;
    }
  }
  console.log(`[seed/role-permissions] seeded ${count} role-permission links`);
}
