import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listMonthExpSga } from "../_lib/finance-actions";
import { MonthExpSgaGridContainer } from "./_components/MonthExpSgaGridContainer";

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
  const headerStore = await headers();
  const session = await getSession(headerStore.get("x-session-id") ?? "");
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.MonthExpSga");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const listResult = await listMonthExpSga({
    page,
    limit,
    ym: params.ym || undefined,
    costCd: params.costCd || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales / Finance" title={t("title")} description={t("description")} />
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
    </div>
  );
}
