/**
 * packages/shared/validation/admin/menu.ts
 *
 * /admin/menus 마스터(menu_item) + 디테일(menu_permission) Zod 스키마.
 *
 * 그라운드 트루스: menu_item / menu_permission Drizzle schema
 *   (packages/db/schema/menu.ts, packages/db/schema/menu-permission.ts).
 *
 * 권한 게이트: ADMIN_ALL (server actions에서 부여).
 *
 * NOTE — 스키마 컬럼:
 *   menu_item:  id, workspaceId, parentId, code, kind, label, description, icon,
 *               routePath, sortOrder, isVisible, requiredRole(@deprecated), createdAt, updatedAt.
 *   menu_permission: (menuItemId, permissionId) PK.
 *
 *   `badge` 컬럼은 현재 스키마에 없으므로 grid에서도 제외한다 (spec 대비 deviation).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// menuItem row (output)
// ---------------------------------------------------------------------------
export const menuKindEnum = z.enum(["menu", "action"]);
export type MenuKind = z.infer<typeof menuKindEnum>;

export const menuRow = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(100),
  kind: menuKindEnum,
  /** parent code (NULL = top-level). 그리드에서는 parentId 대신 parentCode로 표시·편집한다. */
  parentCode: z.string().max(100).nullable(),
  label: z.string().min(1).max(200),
  icon: z.string().max(100).nullable(),
  routePath: z.string().max(300).nullable(),
  sortOrder: z.number().int(),
  description: z.string().nullable(),
  isVisible: z.boolean(),
  // joined: 권한 갯수 (permCnt)
  permCnt: z.number().int().min(0).default(0),
});

export type MenuRow = z.infer<typeof menuRow>;

// ---------------------------------------------------------------------------
// menuItem inputs
// ---------------------------------------------------------------------------
export const menuCreateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(100),
  kind: menuKindEnum.default("menu"),
  parentCode: z.string().max(100).nullable().optional(),
  label: z.string().min(1).max(200),
  icon: z.string().max(100).nullable().optional(),
  routePath: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().default(0),
  description: z.string().nullable().optional(),
  isVisible: z.boolean().default(true),
});

export const menuUpdateInput = z.object({
  id: z.string().uuid(),
  patch: menuCreateInput.partial(),
});

export const saveMenusInput = z.object({
  creates: z.array(menuCreateInput).default([]),
  updates: z.array(menuUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveMenusOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z
    .array(z.object({ id: z.string().optional(), message: z.string() }))
    .optional(),
});

export const listMenusInput = z.object({
  q: z.string().optional(), // matches code
  qLabel: z.string().optional(), // matches label
  kind: menuKindEnum.optional(),
  parentCode: z.string().max(100).optional(), // "" or undefined = no filter; "__root__" = parentId NULL
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listMenusOutput = z.object({
  rows: z.array(menuRow),
  total: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// menu_permission row (output)
// ---------------------------------------------------------------------------
export const menuPermissionRow = z.object({
  permissionId: z.string().uuid(),
  permissionCode: z.string(), // "resource:action" composite
  permissionDescription: z.string().nullable(),
  assigned: z.boolean(),
});

export type MenuPermissionRow = z.infer<typeof menuPermissionRow>;

// ---------------------------------------------------------------------------
// menu_permission inputs
// ---------------------------------------------------------------------------
export const listMenuPermissionsInput = z.object({
  menuId: z.string().uuid(),
});

export const listMenuPermissionsOutput = z.object({
  rows: z.array(menuPermissionRow),
});

export const saveMenuPermissionsInput = z.object({
  menuId: z.string().uuid(),
  /** permission_id list to add (must not already exist) */
  assigned: z.array(z.string().uuid()).default([]),
  /** permission_id list to remove */
  removed: z.array(z.string().uuid()).default([]),
});

export const saveMenuPermissionsOutput = z.object({
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
export type MenuCreateInput = z.infer<typeof menuCreateInput>;
export type MenuUpdateInput = z.infer<typeof menuUpdateInput>;
export type SaveMenusInput = z.infer<typeof saveMenusInput>;
export type SaveMenusOutput = z.infer<typeof saveMenusOutput>;
export type ListMenusInput = z.infer<typeof listMenusInput>;
export type ListMenusOutput = z.infer<typeof listMenusOutput>;

export type ListMenuPermissionsInput = z.infer<typeof listMenuPermissionsInput>;
export type ListMenuPermissionsOutput = z.infer<typeof listMenuPermissionsOutput>;
export type SaveMenuPermissionsInput = z.infer<typeof saveMenuPermissionsInput>;
export type SaveMenuPermissionsOutput = z.infer<typeof saveMenuPermissionsOutput>;
