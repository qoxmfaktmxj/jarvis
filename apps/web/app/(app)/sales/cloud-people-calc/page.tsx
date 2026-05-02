import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { listCloudPeopleCalc } from "./actions";
import { CloudPeopleCalcGridContainer } from "./_components/CloudPeopleCalcGridContainer";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  ym?: string;
  personType?: string;
  calcType?: string;
};

export default async function SalesCloudPeopleCalcPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.CloudPeopleCalc");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const result = await listCloudPeopleCalc({
    page,
    limit,
    q: params.q || undefined,
    contYear: params.contYear || undefined,
    ym: params.ym || undefined,
    personType: params.personType || undefined,
    calcType: params.calcType || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · People" title={t("title")} description={t("description")} />
      <CloudPeopleCalcGridContainer
        rows={result.ok ? result.rows : []}
        total={result.ok ? result.total : 0}
        limit={limit}
        initialFilters={{
          q: params.q ?? "",
          contYear: params.contYear ?? "",
          ym: params.ym ?? "",
          personType: params.personType ?? "",
          calcType: params.calcType ?? "",
          page: String(page),
        }}
      />
    </div>
  );
}
