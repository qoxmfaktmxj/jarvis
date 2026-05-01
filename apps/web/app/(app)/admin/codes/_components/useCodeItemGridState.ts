"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/useCodeItemGridState.ts
 *
 * 공통코드 — 세부코드(detail) 그리드 행 상태 훅.
 * 공유 useGridState<T>를 CodeItemRow 타입으로 instantiate한 thin wrapper +
 * makeBlankCodeItem helper.
 *
 * 시작일/종료일 default는 packages/shared/validation/admin/code.ts의
 * codeItemCreateInput zod default와 동일 (1900-01-01 / 2999-12-31).
 */
import { useGridState } from "@/components/grid/useGridState";
import type { CodeItemRow } from "@jarvis/shared/validation/admin/code";

export function makeBlankCodeItem(groupId: string): CodeItemRow {
  return {
    id: crypto.randomUUID(),
    groupId,
    code: "",
    name: "",
    nameEn: null,
    fullName: null,
    memo: null,
    note1: null,
    note2: null,
    note3: null,
    note4: null,
    note5: null,
    note6: null,
    note7: null,
    note8: null,
    note9: null,
    numNote: null,
    sdate: "1900-01-01",
    edate: "2999-12-31",
    visualYn: true,
    sortOrder: 0,
    isActive: true,
  } satisfies CodeItemRow;
}

export function useCodeItemGridState(initial: CodeItemRow[]) {
  return useGridState<CodeItemRow>(initial);
}
