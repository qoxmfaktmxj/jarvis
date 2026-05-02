import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listCloudPeopleBase } from "./actions";
import { CloudPeopleBaseGridContainer } from "./_components/CloudPeopleBaseGridContainer";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  pjtCode?: string;
  personType?: string;
  calcType?: string;
};

export default async function SalesCloudPeopleBasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.CloudPeopleBase");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const result = await listCloudPeopleBase({
    page,
    limit,
    q: params.q || undefined,
    contYear: params.contYear || undefined,
    pjtCode: params.pjtCode || undefined,
    personType: params.personType || undefined,
    calcType: params.calcType || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · People" title={t("title")} description={t("description")} />
      <CloudPeopleBaseGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          contYear: params.contYear ?? "",
          pjtCode: params.pjtCode ?? "",
          personType: params.personType ?? "",
          calcType: params.calcType ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
