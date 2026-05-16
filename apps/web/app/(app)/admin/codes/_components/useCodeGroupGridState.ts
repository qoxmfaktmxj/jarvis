"use client";
/**
 * apps/web/app/(app)/admin/codes/_components/useCodeGroupGridState.ts
 *
 * 공통코드 — 그룹코드(master) helper.
 * Phase C: useGridState wrapper 제거 — DataGrid가 자체 state를 관리.
 * makeBlankCodeGroup helper만 유지 (CodesPageClient가 DataGrid.makeBlankRow로 전달).
 */
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
