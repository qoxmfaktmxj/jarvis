import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { listCloudPeopleBase } from "./actions";
import { CloudPeopleBaseGridContainer } from "./_components/CloudPeopleBaseGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  pjtCode?: string;
  personType?: string;
  calcType?: string;
};

export default async function SalesCloudPeopleBasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.CloudPeopleBase");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
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
      <PageHeader title={t("title")}/>
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
