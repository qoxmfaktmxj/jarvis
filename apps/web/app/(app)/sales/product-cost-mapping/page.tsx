/**
 * apps/web/app/(app)/sales/product-cost-mapping/page.tsx
 *
 * 영업 제품군 × 코스트 매핑 (sales_product_type_cost / TBIZ024 row mapping).
 * Phase-Sales P1.5 Task 6 (2026-05-01).
 * Phase-Sales P2-A Task 7.6 (2026-05-01): searchParams (searchYmd, searchCostNm, page).
 *
 * 권한: SALES_ALL — 다른 sales/* 라우트와 동일.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import {
  listCostMasterOptions,
  listProductTypeOptions,
} from "@/lib/queries/sales-product-type-cost";
import { listProductCostMapping } from "./actions";
import { ProductCostMappingGrid } from "./_components/ProductCostMappingGrid";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SalesProductCostMappingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const sp = await searchParams;
  const limit = 50;
  const page = Math.max(1, Number(sp.page ?? 1));
  const searchYmd = typeof sp.searchYmd === "string" ? sp.searchYmd : undefined;
  const searchCostNm = typeof sp.searchCostNm === "string" ? sp.searchCostNm : undefined;
  const productTypeId = typeof sp.productTypeId === "string" ? sp.productTypeId : undefined;
  const costId = typeof sp.costId === "string" ? sp.costId : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;

  const [listResult, productTypeOptions, costOptions] = await Promise.all([
    listProductCostMapping({ page, limit, searchYmd, searchCostNm, productTypeId, costId, q }),
    listProductTypeOptions(session.workspaceId),
    listCostMasterOptions(session.workspaceId),
  ]);

  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Product Cost Mapping"
        title="제품-코스트 매핑"
        description="영업 제품군과 코스트 마스터의 기간별 매핑(TBIZ024 row)을 관리합니다."
      />
      <ProductCostMappingGrid
        initialRows={initialRows}
        initialTotal={initialTotal}
        page={page}
        limit={limit}
        initialSearchYmd={searchYmd ?? ""}
        initialSearchCostNm={searchCostNm ?? ""}
        productTypeOptions={productTypeOptions}
        costOptions={costOptions}
      />
    </div>
  );
}
