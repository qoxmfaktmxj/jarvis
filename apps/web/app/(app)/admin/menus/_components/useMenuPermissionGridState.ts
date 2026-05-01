"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/useMenuPermissionGridState.ts
 *
 * 메뉴 권한(detail) 그리드 행 상태 훅.
 *
 * NOTE — 디테일 그리드는 행 추가/복사/삭제가 없다. 모든 권한 행이 항상 존재하고
 * `assigned` boolean만 토글한다. 따라서 `useGridState`는 `update` + `dirtyCount`
 * + `toBatch` 기능을 그대로 활용하되, `id`는 `permissionId`를 그대로 사용한다.
 */
import { useGridState } from "@/components/grid/useGridState";
import type { MenuPermissionRow } from "@jarvis/shared/validation/admin/menu";

/** Row shape with id (= permissionId) so useGridState can index by id. */
export type MenuPermissionGridRow = MenuPermissionRow & { id: string };

export function toGridRows(rows: MenuPermissionRow[]): MenuPermissionGridRow[] {
  return rows.map((r) => ({ ...r, id: r.permissionId }));
}

export function useMenuPermissionGridState(initial: MenuPermissionRow[]) {
  return useGridState<MenuPermissionGridRow>(toGridRows(initial));
}
