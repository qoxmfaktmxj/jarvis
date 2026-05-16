"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/useMenuPermissionGridState.ts
 *
 * MenuPermissionGridRow 타입 + toGridRows helper.
 *
 * Phase B: 그리드 상태는 DataGrid 내부 useGridState에 위임.
 * useMenuPermissionGridState hook 제거 (MenusPageClient가 DataGrid에 위임).
 */
import type { MenuPermissionRow } from "@jarvis/shared/validation/admin/menu";

/** Row shape with id (= permissionId) so useGridState can index by id. */
export type MenuPermissionGridRow = MenuPermissionRow & { id: string };

export function toGridRows(rows: MenuPermissionRow[]): MenuPermissionGridRow[] {
  return rows.map((r) => ({ ...r, id: r.permissionId }));
}
