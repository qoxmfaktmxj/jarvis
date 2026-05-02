import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContractUploadsGridContainer } from "./_components/ContractUploadsGridContainer";
import { listContractUploads, listUnifiedContractUploads } from "./actions";

type SearchParams = {
  page?: string;
  q?: string;
  ym?: string;
  companyCd?: string;
};

export default async function SalesContractUploadsPage({
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
  const filters = {
    q: params.q ?? "",
    ym: params.ym ?? "",
    companyCd: params.companyCd ?? "",
    page: String(page),
  };

  const [uploads, unified] = await Promise.all([
    listContractUploads({
      page,
      limit,
      q: filters.q || undefined,
      ym: filters.ym || undefined,
      companyCd: filters.companyCd || undefined,
    }),
    listUnifiedContractUploads({
      q: filters.q || undefined,
      ym: filters.ym || undefined,
      companyCd: filters.companyCd || undefined,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Contract Uploads"
        title="계약 업로드 관리"
        description="계약 계획/전망/실적 업로드 자료와 통합 검색 결과를 관리합니다."
      />
      <ContractUploadsGridContainer
        rows={uploads.ok ? uploads.rows : []}
        total={uploads.ok ? uploads.total : 0}
        unifiedRows={unified.ok ? unified.rows : []}
        limit={limit}
        initialFilters={filters}
      />
    </div>
  );
}
