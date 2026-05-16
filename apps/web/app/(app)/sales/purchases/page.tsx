import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listPurchases } from "../_lib/finance-actions";
import { PurchasesGridContainer } from "./_components/PurchasesGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  purType?: string;
  baseDate?: string;
};

export default async function SalesPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.Purchases");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const listResult = await listPurchases({
    page,
    limit,
    q: params.q || undefined,
    purType: params.purType || undefined,
    baseDate: params.baseDate || undefined,
  });

  return (
    <PageShellFit title={t("title")}>
      <PurchasesGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          purType: params.purType ?? "",
          baseDate: params.baseDate ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
