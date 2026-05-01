import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ProductTypesGridContainer } from "./_components/ProductTypesGridContainer";
import { listProductTypes } from "./actions";

export default async function SalesProductTypesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) redirect("/dashboard?error=forbidden");

  const limit = 50;
  const sp = searchParams ? await searchParams : {};
  const filters = {
    productCd: typeof sp.productCd === "string" ? sp.productCd : undefined,
    productNm: typeof sp.productNm === "string" ? sp.productNm : undefined,
    page: 1,
    limit,
  };

  const listResult = await listProductTypes(filters);
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Product Types" title="제품군관리" description="영업 제품 유형 마스터를 관리합니다." />
      <ProductTypesGridContainer
        rows={initialRows}
        total={initialTotal}
        page={1}
        limit={limit}
        initialFilters={{
          productCd: filters.productCd ?? "",
          productNm: filters.productNm ?? "",
        }}
      />
    </div>
  );
}
