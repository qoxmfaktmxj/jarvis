import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { listCloudPeopleCalc } from "./actions";
import { CloudPeopleCalcGridContainer } from "./_components/CloudPeopleCalcGridContainer";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

type SearchParams = {
  page?: string;
  q?: string;
  contYear?: string;
  ym?: string;
  personType?: string;
  calcType?: string;
};

export default async function SalesCloudPeopleCalcPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageSession(PERMISSIONS.SALES_ADMIN, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.CloudPeopleCalc");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = DEFAULT_PAGE_SIZE;
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
    <PageShellFit title={t("title")}>
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
    </PageShellFit>
  );
}
