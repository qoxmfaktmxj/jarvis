/**
 * packages/shared/validation/admin/role.ts
 *
 * /admin/roles 마스터(role) + 디테일(role_permission) Zod 스키마.
 *
 * 그라운드 트루스: role / role_permission Drizzle schema
 *   (packages/db/schema/user.ts).
 *
 * 권한 게이트: ADMIN_ALL (server actions에서 부여).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// role row (output)
// ---------------------------------------------------------------------------
export const roleRow = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  /** 연결된 권한 수 (joined count) */
  permCount: z.number().int().min(0).default(0),
});

export type RoleRow = z.infer<typeof roleRow>;

// ---------------------------------------------------------------------------
// role inputs
// ---------------------------------------------------------------------------
export const roleCreateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  isSystem: z.boolean().default(false),
});

/**
 * Update patch: name/description만 변경 허용.
 * id/code/isSystem은 immutable — primary key 변경 차단 + isSystem 우회 방지
 * (codex P2 finding 2026-05-16).
 */
export const roleUpdatePatch = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
});

export const roleUpdateInput = z.object({
  id: z.string().uuid(),
  patch: roleUpdatePatch,
});

export const saveRolesInput = z.object({
  creates: z.array(roleCreateInput).default([]),
  updates: z.array(roleUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveRolesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export const listRolesInput = z.object({
  q: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listRolesOutput = z.object({
  rows: z.array(roleRow),
  total: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// role_permission row (output)
// ---------------------------------------------------------------------------
export const rolePermissionRow = z.object({
  permissionId: z.string().uuid(),
  permissionCode: z.string(), // "resource:action" composite
  permissionDescription: z.string().nullable(),
  assigned: z.boolean(),
});

export type RolePermissionRow = z.infer<typeof rolePermissionRow>;

// ---------------------------------------------------------------------------
// role_permission inputs
// ---------------------------------------------------------------------------
export const listRolePermissionsInput = z.object({
  roleId: z.string().uuid(),
});

export const listRolePermissionsOutput = z.object({
  rows: z.array(rolePermissionRow),
});

export const saveRolePermissionsInput = z.object({
  roleId: z.string().uuid(),
  /** permission_id list to add (onConflictDoNothing) */
  assigned: z.array(z.string().uuid()).default([]),
  /** permission_id list to remove */
  removed: z.array(z.string().uuid()).default([]),
});

export const saveRolePermissionsOutput = z.object({
  ok: z.boolean(),
  added: z.array(z.string().uuid()).optional(),
  removed: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type RoleCreateInput = z.infer<typeof roleCreateInput>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInput>;
export type SaveRolesInput = z.infer<typeof saveRolesInput>;
export type SaveRolesOutput = z.infer<typeof saveRolesOutput>;
export type ListRolesInput = z.infer<typeof listRolesInput>;
export type ListRolesOutput = z.infer<typeof listRolesOutput>;

export type ListRolePermissionsInput = z.infer<typeof listRolePermissionsInput>;
export type ListRolePermissionsOutput = z.infer<typeof listRolePermissionsOutput>;
export type SaveRolePermissionsInput = z.infer<typeof saveRolePermissionsInput>;
export type SaveRolePermissionsOutput = z.infer<typeof saveRolePermissionsOutput>;
