import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listPurchases } from "../_lib/finance-actions";
import { PurchasesGridContainer } from "./_components/PurchasesGridContainer";

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
  const headerStore = await headers();
  const session = await getSession(headerStore.get("x-session-id") ?? "");
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.Purchases");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const listResult = await listPurchases({
    page,
    limit,
    q: params.q || undefined,
    purType: params.purType || undefined,
    baseDate: params.baseDate || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales / Finance" title={t("title")} description={t("description")} />
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
    </div>
  );
}
