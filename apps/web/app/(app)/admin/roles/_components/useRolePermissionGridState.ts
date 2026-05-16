"use client";
/**
 * apps/web/app/(app)/admin/roles/_components/useRolePermissionGridState.ts
 *
 * RolePermissionGridRow 타입 + toGridRows helper.
 * 패턴 출처: admin/menus/_components/useMenuPermissionGridState.ts.
 */
import type { RolePermissionRow } from "@jarvis/shared/validation/admin/role";

/** Row shape with id (= permissionId) so useGridState can index by id. */
export type RolePermissionGridRow = RolePermissionRow & { id: string };

export function toGridRows(rows: RolePermissionRow[]): RolePermissionGridRow[] {
  return rows.map((r) => ({ ...r, id: r.permissionId }));
}
