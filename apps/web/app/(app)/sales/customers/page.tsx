import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CustomersGridContainer } from "./_components/CustomersGridContainer";
import { listCustomers } from "./actions";

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
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const limit = 50;
  const sp = searchParams ? await searchParams : {};
  const filters = {
    custNm: typeof sp.custNm === "string" ? sp.custNm : undefined,
    custKindCd: typeof sp.custKindCd === "string" ? sp.custKindCd : undefined,
    custDivCd: typeof sp.custDivCd === "string" ? sp.custDivCd : undefined,
    chargerNm: typeof sp.chargerNm === "string" ? sp.chargerNm : undefined,
    page: 1,
    limit,
  };

  const [listResult, custKindOptions, custDivOptions, exchangeTypeOptions] = await Promise.all([
    listCustomers(filters),
    loadCodeOptions(session.workspaceId, "SALES_CUST_KIND"),
    loadCodeOptions(session.workspaceId, "SALES_CUST_DIV"),
    loadCodeOptions(session.workspaceId, "SALES_EXCHANGE_TYPE"),
  ]);

  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Customers"
        title="고객사관리"
        description="외부 거래처(고객사) 마스터를 관리합니다."
      />
      <CustomersGridContainer
        rows={initialRows}
        total={initialTotal}
        page={1}
        limit={limit}
        initialFilters={{
          custNm: filters.custNm ?? "",
          custKindCd: filters.custKindCd ?? "",
          custDivCd: filters.custDivCd ?? "",
          chargerNm: filters.chargerNm ?? "",
        }}
        codeOptions={{
          custKind: custKindOptions,
          custDiv: custDivOptions,
          exchangeType: exchangeTypeOptions,
        }}
      />
    </div>
  );
}
