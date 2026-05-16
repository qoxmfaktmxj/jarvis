import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listMonthExpSga } from "../_lib/finance-actions";
import { MonthExpSgaGridContainer } from "./_components/MonthExpSgaGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  ym?: string;
  costCd?: string;
};

export default async function SalesMonthExpSgaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.MonthExpSga");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const listResult = await listMonthExpSga({
    page,
    limit,
    ym: params.ym || undefined,
    costCd: params.costCd || undefined,
  });

  return (
    <PageShellFit title={t("title")}>
      <MonthExpSgaGridContainer
        rows={listResult.ok ? listResult.rows : []}
        total={listResult.ok ? listResult.total : 0}
        limit={limit}
        initialFilters={{
          ym: params.ym ?? "",
          costCd: params.costCd ?? "",
          page: String(page),
        }}
      />
    </PageShellFit>
  );
}
