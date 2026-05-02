import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContractMonthsGridContainer } from "./_components/ContractMonthsGridContainer";
import { listContractMonths } from "./actions";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Contract Months"
        title="계약 월별"
        description="계약별 월별 계획·예상·실적 데이터를 관리합니다."
      />
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
    </div>
  );
}
