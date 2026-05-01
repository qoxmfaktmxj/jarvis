import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CustomerContactsGridContainer } from "./_components/CustomerContactsGridContainer";
import { listCustomerContacts } from "./actions";

type SearchParams = {
  page?: string;
  custMcd?: string;
  custName?: string;
  chargerNm?: string;
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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;

  const listResult = await listCustomerContacts({
    page,
    limit,
    custMcd: params.custMcd || undefined,
    custName: params.custName || undefined,
    chargerNm: params.chargerNm || undefined,
    hpNo: params.hpNo || undefined,
    email: params.email || undefined,
    searchYmdFrom: params.searchYmdFrom || undefined,
    searchYmdTo: params.searchYmdTo || undefined,
  });
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Customer Contacts"
        title="고객담당자"
        description="고객사 측 담당자(컨택) 마스터를 관리합니다."
      />
      <CustomerContactsGridContainer
        rows={initialRows}
        total={initialTotal}
        limit={limit}
        initialFilters={{
          custName: params.custName ?? "",
          chargerNm: params.chargerNm ?? "",
          hpNo: params.hpNo ?? "",
          email: params.email ?? "",
          searchYmdFrom: params.searchYmdFrom ?? "",
          searchYmdTo: params.searchYmdTo ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
