import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listTaxBills } from "../_lib/finance-actions";
import { TaxBillsGridContainer } from "./_components/TaxBillsGridContainer";

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
  const headerStore = await headers();
  const session = await getSession(headerStore.get("x-session-id") ?? "");
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.TaxBills");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
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
    <div className="space-y-6">
      <PageHeader eyebrow="Sales / Finance" title={t("title")} description={t("description")} />
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
    </div>
  );
}
