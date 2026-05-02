import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listFreelancers } from "./actions";
import { FreelancersGridContainer } from "./_components/FreelancersGridContainer";

type SearchParams = {
  page?: string;
  q?: string;
  belongYm?: string;
  businessCd?: string;
};

export default async function SalesFreelancersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.Freelancers");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const result = await listFreelancers({
    page,
    limit,
    q: params.q || undefined,
    belongYm: params.belongYm || undefined,
    businessCd: params.businessCd || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · People" title={t("title")} description={t("description")} />
      <FreelancersGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          belongYm: params.belongYm ?? "",
          businessCd: params.businessCd ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
