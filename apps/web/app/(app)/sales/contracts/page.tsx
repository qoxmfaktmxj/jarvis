import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractsGridContainer } from "./_components/ContractsGridContainer";
import { listContracts } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  customerNo?: string;
  contGbCd?: string;
};

export default async function SalesContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listContracts({
    page,
    limit,
    q: params.q || undefined,
    customerNo: params.customerNo || undefined,
    contGbCd: params.contGbCd || undefined,
  });
  const initialRows = listResult.ok ? listResult.rows : [];
  const initialTotal = listResult.ok ? listResult.total : 0;

  return (
    <div className="space-y-3">
      <PageHeader title="계약 관리" />
      <ContractsGridContainer
        rows={initialRows}
        total={initialTotal}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          customerNo: params.customerNo ?? "",
          contGbCd: params.contGbCd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
