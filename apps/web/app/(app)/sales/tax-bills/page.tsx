import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listTaxBills } from "../_lib/finance-actions";
import { TaxBillsGridContainer } from "./_components/TaxBillsGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  billType?: string;
  ym?: string;
  fromYmd?: string;
  toYmd?: string;
};

export default async function SalesTaxBillsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.TaxBills");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const listResult = await listTaxBills({
    page,
    limit,
    q: params.q || undefined,
    billType: params.billType || undefined,
    ym: params.ym || undefined,
    fromYmd: params.fromYmd || undefined,
    toYmd: params.toYmd || undefined,
  });

  return (
    <PageShellFit title={t("title")}>
      <TaxBillsGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          billType: params.billType ?? "",
          ym: params.ym ?? "",
          fromYmd: params.fromYmd ?? "",
          toYmd: params.toYmd ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
