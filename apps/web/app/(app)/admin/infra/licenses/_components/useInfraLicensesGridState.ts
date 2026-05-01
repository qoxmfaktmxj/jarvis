"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/useInfraLicensesGridState.ts
 *
 * 인프라 라이선스 그리드 전용 행 상태 훅.
 * 공유 useGridState<T>를 InfraLicenseRow 타입으로 instantiate한 thin wrapper.
 * (따로 두는 이유: domain별로 makeBlankRow 같은 helper를 같은 파일에 묶어두면
 *  Container의 import surface가 작아지고 Task 5의 grid 구조와 admin/companies가
 *  형태적으로 일관됨.)
 */
import { useGridState } from "@/components/grid/useGridState";
import type { InfraLicenseRow } from "@jarvis/shared/validation/infra/license";

const BOOLEAN_KEYS = [
  "empYn",
  "hrYn",
  "orgYn",
  "eduYn",
  "papYn",
  "carYn",
  "cpnYn",
  "timYn",
  "benYn",
  "appYn",
  "eisYn",
  "sysYn",
  "yearYn",
  "boardYn",
  "wlYn",
  "pdsYn",
  "idpYn",
  "abhrYn",
  "workYn",
  "secYn",
  "docYn",
  "disYn",
] as const;

export type ModuleBooleanKey = (typeof BOOLEAN_KEYS)[number];
export const INFRA_LICENSE_BOOLEAN_KEYS: readonly ModuleBooleanKey[] = BOOLEAN_KEYS;

export function makeBlankInfraLicense(): InfraLicenseRow {
  const today = new Date().toISOString().slice(0, 10);
  const flags = Object.fromEntries(BOOLEAN_KEYS.map((k) => [k, false])) as Record<
    ModuleBooleanKey,
    boolean
  >;
  return {
    id: crypto.randomUUID(),
    companyId: "",
    legacyCompanyCd: null,
    legacyCompanyNm: null,
    symd: today,
    eymd: null,
    devGbCode: "03", // 운영 default; INFRA_DEV_GB seed는 Task 10에서 들어옴
    domainAddr: null,
    ipAddr: null,
    userCnt: null,
    corpCnt: null,
    ...flags,
  } satisfies InfraLicenseRow;
}

export function useInfraLicensesGridState(initial: InfraLicenseRow[]) {
  return useGridState<InfraLicenseRow>(initial);
}
