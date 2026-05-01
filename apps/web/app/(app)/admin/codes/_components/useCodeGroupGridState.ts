"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/useCodeGroupGridState.ts
 *
 * 공통코드 — 그룹코드(master) 그리드 행 상태 훅.
 * 공유 useGridState<T>를 CodeGroupRow 타입으로 instantiate한 thin wrapper +
 * makeBlankCodeGroup helper. (admin/infra/licenses 패턴 그대로.)
 */
import { useGridState } from "@/components/grid/useGridState";
import type { CodeGroupRow } from "@jarvis/shared/validation/admin/code";

export function makeBlankCodeGroup(): CodeGroupRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    nameEn: null,
    description: null,
    businessDivCode: null,
    kindCode: "C",
    commonYn: false,
    isActive: true,
    subCnt: 0,
  } satisfies CodeGroupRow;
}

export function useCodeGroupGridState(initial: CodeGroupRow[]) {
  return useGridState<CodeGroupRow>(initial);
}
