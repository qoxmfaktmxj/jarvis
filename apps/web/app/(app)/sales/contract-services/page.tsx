import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContractServicesGridContainer } from "./_components/ContractServicesGridContainer";
import { listContractServices } from "./actions";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Contract Services"
        title="용역인원관리"
        description="계약 용역 인원 마스터를 관리합니다."
      />
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
