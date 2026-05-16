import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractServicesGridContainer } from "./_components/ContractServicesGridContainer";
import { listContractServices } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  pjtCd?: string;
  attendCd?: string;
};

export default async function SalesContractServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listContractServices({
    page,
    limit,
    q: params.q || undefined,
    pjtCd: params.pjtCd || undefined,
    attendCd: params.attendCd || undefined,
  });
  const initialRows = listResult.ok ? listResult.rows : [];
  const initialTotal = listResult.ok ? listResult.total : 0;

  return (
    <div className="space-y-3">
      <PageHeader title="서비스 인력" />
      <ContractServicesGridContainer
        rows={initialRows}
        total={initialTotal}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          pjtCd: params.pjtCd ?? "",
          attendCd: params.attendCd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
