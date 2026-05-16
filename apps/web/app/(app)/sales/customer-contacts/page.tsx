import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { CustomerContactsGridContainer } from "./_components/CustomerContactsGridContainer";
import { listCustomerContacts } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  custMcd?: string;
  // custName is used for both the "담당자명" search input AND the custMcd column filter.
  // chargerNm was removed — the "담당자명" UI input now writes to custName directly (Approach A).
  custName?: string;
  hpNo?: string;
  email?: string;
  searchYmdFrom?: string;
  searchYmdTo?: string;
};

export default async function SalesCustomerContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;

  const listResult = await listCustomerContacts({
    page,
    limit,
    custMcd: params.custMcd || undefined,
    custName: params.custName || undefined,
    hpNo: params.hpNo || undefined,
    email: params.email || undefined,
    searchYmdFrom: params.searchYmdFrom || undefined,
    searchYmdTo: params.searchYmdTo || undefined,
  });
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <PageShellFit title="고객담당자">
      <CustomerContactsGridContainer
        rows={initialRows}
        total={initialTotal}
        limit={limit}
        initialFilters={{
          custName: params.custName ?? "",
          hpNo: params.hpNo ?? "",
          email: params.email ?? "",
          searchYmdFrom: params.searchYmdFrom ?? "",
          searchYmdTo: params.searchYmdTo ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
