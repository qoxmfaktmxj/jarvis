/**
 * apps/web/lib/queries/sales-product-type-cost.ts
 *
 * sales/product-cost-mapping 화면(RSC)에서 사용하는 read-only 조회.
 *
 * - listProductTypeOptions: 제품군 select 셀 옵션 (productTypeId → "code · name")
 * - listCostMasterOptions:  코스트 select 셀 옵션 (costId → "code · name")
 *
 * 본 파일은 sales/product-cost-mapping/page.tsx 에서만 사용한다.
 * 쓰기·감사 로깅은 actions.ts (`saveProductCostMapping`)에서 담당.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesCostMaster, salesProductType } from "@jarvis/db/schema";

export type LookupOption = { value: string; label: string };

export async function listProductTypeOptions(workspaceId: string): Promise<LookupOption[]> {
  const rows = await db
    .select({
      id: salesProductType.id,
      cd: salesProductType.productCd,
      nm: salesProductType.productNm,
    })
    .from(salesProductType)
    .where(eq(salesProductType.workspaceId, workspaceId))
    .orderBy(asc(salesProductType.productCd));
  return rows.map((r) => ({ value: r.id, label: `${r.cd} · ${r.nm}` }));
}

export async function listCostMasterOptions(workspaceId: string): Promise<LookupOption[]> {
  const rows = await db
    .select({
      id: salesCostMaster.id,
      cd: salesCostMaster.costCd,
      nm: salesCostMaster.costNm,
    })
    .from(salesCostMaster)
    .where(eq(salesCostMaster.workspaceId, workspaceId))
    .orderBy(asc(salesCostMaster.costCd));
  return rows.map((r) => ({ value: r.id, label: `${r.cd} · ${r.nm}` }));
}
