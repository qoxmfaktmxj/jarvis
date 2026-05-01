"use client";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/_components/useProductCostMappingGridState.ts
 *
 * 영업 제품군 × 코스트 매핑 그리드 전용 행 상태 훅.
 * 공유 useGridState<T>를 ProductCostMappingRow 타입으로 instantiate한 thin wrapper.
 *
 * Phase-Sales P1.5 Task 6 (2026-05-01).
 */
import { useGridState } from "@/components/grid/useGridState";
import type { ProductCostMappingRow } from "@jarvis/shared/validation/sales/product-type-cost";

export function makeBlankProductCostMapping(): ProductCostMappingRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    productTypeId: "",
    costId: "",
    productTypeNm: null,
    costNm: null,
    legacyProductTypeCd: null,
    legacyCostCd: null,
    sdate: today,
    edate: null,
    bizYn: false,
    note: null,
  } satisfies ProductCostMappingRow;
}

export function useProductCostMappingGridState(initial: ProductCostMappingRow[]) {
  return useGridState<ProductCostMappingRow>(initial);
}
