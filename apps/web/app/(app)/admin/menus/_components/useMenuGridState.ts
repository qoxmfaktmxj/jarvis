"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/useMenuGridState.ts
 *
 * makeBlankMenu helper — 신규 메뉴 행 기본값.
 *
 * Phase B: 그리드 상태는 DataGrid 내부 useGridState에 위임.
 * useMenuGridState hook 제거 (MenusPageClient가 DataGrid에 위임).
 */
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
