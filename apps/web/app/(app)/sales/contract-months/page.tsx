import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractMonthsGridContainer } from "./_components/ContractMonthsGridContainer";
import { listContractMonths } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  contractId?: string;
  ym?: string;
};

export default async function SalesContractMonthsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listContractMonths({
    page,
    limit,
    q: params.q || undefined,
    contractId: params.contractId || undefined,
    ym: params.ym || undefined,
  });
  const initialRows = listResult.ok ? listResult.rows : [];
  const initialTotal = listResult.ok ? listResult.total : 0;

  return (
    <PageShellFit title="계약 월별">
      <ContractMonthsGridContainer
        rows={initialRows}
        total={initialTotal}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          contractId: params.contractId ?? "",
          ym: params.ym ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
