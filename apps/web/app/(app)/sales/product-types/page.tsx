import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { ProductTypesGridContainer } from "./_components/ProductTypesGridContainer";
import { listProductTypes } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

export default async function SalesProductTypesPage() {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const limit = DEFAULT_PAGE_SIZE;
  const listResult = await listProductTypes({ page: 1, limit });
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <PageShellFit title="제품군관리">
      <ProductTypesGridContainer rows={initialRows} total={initialTotal} page={1} limit={limit} />
    </PageShellFit>
  );
}
