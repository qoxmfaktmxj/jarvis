import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { CustomersGridContainer } from "./_components/CustomersGridContainer";
import { listCustomers } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.sortOrder, codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export default async function SalesCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const limit = DEFAULT_PAGE_SIZE;
  const filters = {
    custNm: sp.custNm,
    custKindCd: sp.custKindCd,
    custDivCd: sp.custDivCd,
    chargerNm: sp.chargerNm,
    searchYmdFrom: sp.searchYmdFrom,
    searchYmdTo: sp.searchYmdTo,
  };

  const [listResult, custKindOptions, custDivOptions, exchangeTypeOptions] = await Promise.all([
    listCustomers({ page, limit, ...filters }),
    loadCodeOptions(session.workspaceId, "SALES_CUST_KIND"),
    loadCodeOptions(session.workspaceId, "SALES_CUST_DIV"),
    loadCodeOptions(session.workspaceId, "SALES_EXCHANGE_TYPE"),
  ]);

  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-3">
      <PageHeader title="고객사관리" />
      <CustomersGridContainer
        rows={initialRows}
        total={initialTotal}
        page={page}
        limit={limit}
        initialFilters={filters}
        codeOptions={{
          custKind: custKindOptions,
          custDiv: custDivOptions,
          exchangeType: exchangeTypeOptions,
        }}
      />
    </div>
  );
}
