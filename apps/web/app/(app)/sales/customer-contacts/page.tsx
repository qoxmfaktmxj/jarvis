import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CustomerContactsGridContainer } from "./_components/CustomerContactsGridContainer";
import { listCustomerContacts } from "./actions";

export default async function SalesCustomerContactsPage({
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
    custName: typeof sp.custName === "string" ? sp.custName : undefined,
    chargerNm: typeof sp.chargerNm === "string" ? sp.chargerNm : undefined,
    hpNo: typeof sp.hpNo === "string" ? sp.hpNo : undefined,
    email: typeof sp.email === "string" ? sp.email : undefined,
    page: 1,
    limit,
  };

  const listResult = await listCustomerContacts(filters);
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
        page={1}
        limit={limit}
        initialFilters={{
          custName: filters.custName ?? "",
          chargerNm: filters.chargerNm ?? "",
          hpNo: filters.hpNo ?? "",
          email: filters.email ?? "",
        }}
      />
    </div>
  );
}
