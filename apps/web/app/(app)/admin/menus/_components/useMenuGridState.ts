"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/useMenuGridState.ts
 *
 * 메뉴(master) 그리드 행 상태 훅.
 * 공유 useGridState<T>를 MenuRow 타입으로 instantiate한 thin wrapper +
 * makeBlankMenu helper. (admin/codes 패턴 그대로.)
 */
import {
  useGridState,
  type UseGridStateOptions,
} from "@/components/grid/useGridState";
import type { MenuRow } from "@jarvis/shared/validation/admin/menu";

export function makeBlankMenu(): MenuRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    kind: "menu",
    parentCode: null,
    label: "",
    icon: null,
    routePath: null,
    sortOrder: 0,
    description: null,
    isVisible: true,
    badge: null,
    keywords: null,
    permCnt: 0,
  } satisfies MenuRow;
}

export function useMenuGridState(
  initial: MenuRow[],
  options?: UseGridStateOptions<MenuRow>,
) {
  return useGridState<MenuRow>(initial, options);
}
