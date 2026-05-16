import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractUploadsGridContainer } from "./_components/ContractUploadsGridContainer";
import { listContractUploads, listUnifiedContractUploads } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

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
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
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
    <PageShellFit title="계약 업로드 관리">
      <ContractUploadsGridContainer
        rows={uploads.ok ? uploads.rows : []}
        total={uploads.ok ? uploads.total : 0}
        unifiedRows={unified.ok ? unified.rows : []}
        limit={limit}
        initialFilters={filters}
      />
    </PageShellFit>
  );
}
