/**
 * apps/web/app/(app)/sales/product-cost-mapping/page.tsx
 *
 * 영업 제품군 × 코스트 매핑 (sales_product_type_cost / TBIZ024 row mapping).
 * Phase-Sales P1.5 Task 6 (2026-05-01).
 * Baseline applied: Task 7 (2026-05-01) — searchParams → initialFilters SSR.
 *
 * 권한: SALES_ALL — 다른 sales/* 라우트와 동일.
 *
 * 메뉴 노출 (menu_item) 은 Task 10에서 시드한다. 현재는 직접 URL로만 접근 가능.
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

export default async function SalesProductCostMappingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const limit = 50;
  const sp = searchParams ? await searchParams : {};
  const filters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    productTypeId: typeof sp.productTypeId === "string" ? sp.productTypeId : undefined,
    costId: typeof sp.costId === "string" ? sp.costId : undefined,
    page: 1,
    limit,
  };

  const [listResult, productTypeOptions, costOptions] = await Promise.all([
    listProductCostMapping(filters),
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
        page={1}
        limit={limit}
        productTypeOptions={productTypeOptions}
        costOptions={costOptions}
        initialFilters={{
          q: filters.q ?? "",
          productTypeId: filters.productTypeId ?? "",
          costId: filters.costId ?? "",
        }}
      />
    </div>
  );
}
