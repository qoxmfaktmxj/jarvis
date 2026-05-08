import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ProductTypesGridContainer } from "./_components/ProductTypesGridContainer";
import { listProductTypes } from "./actions";

export default async function SalesProductTypesPage() {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const limit = 50;
  const listResult = await listProductTypes({ page: 1, limit });
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Product Types" title="제품군관리" description="영업 제품 유형 마스터를 관리합니다." />
      <ProductTypesGridContainer rows={initialRows} total={initialTotal} page={1} limit={limit} />
    </div>
  );
}
