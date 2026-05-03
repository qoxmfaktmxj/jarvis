"use client";
/**
 * apps/web/app/(app)/infra/_components/useInfraSystemsGridState.ts
 *
 * 인프라구성관리 (Plan 5) 그리드 전용 행 상태 훅.
 * 공유 useGridState<T>의 thin wrapper + makeBlankRow.
 */
import { useGridState } from "@/components/grid/useGridState";
import type { InfraSystemListRow } from "@jarvis/shared/validation/infra/system";

export function makeBlankInfraSystem(): InfraSystemListRow {
  return {
    id: crypto.randomUUID(),
    companyId: "",
    companyName: null,
    systemName: "",
    envType: null,
    domainAddr: null,
    port: null,
    dbType: null,
    dbVersion: null,
    osType: null,
    osVersion: null,
    connectMethod: null,
    deployMethod: null,
    deployFolder: null,
    ownerName: null,
    ownerContact: null,
    wikiPageId: null,
    wikiPageRouteKey: null,
    wikiPageTitle: null,
    note: null,
    sensitivity: "INTERNAL",
  } satisfies InfraSystemListRow;
}

export function useInfraSystemsGridState(initial: InfraSystemListRow[]) {
  return useGridState<InfraSystemListRow>(initial);
}
