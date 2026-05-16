import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { SalesCompaniesGridContainer } from "./_components/SalesCompaniesGridContainer";
import { listSalesCompanies } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.code);
  return rows.map((row) => ({ value: row.code, label: row.name }));
}

export default async function SalesCompaniesPage() {
  const session = await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const t = await getTranslations("Sales.Companies");

  const [initialResult, objectDivOptions, groupOptions, industryOptions] =
    await Promise.all([
      listSalesCompanies({ page: 1, limit: DEFAULT_PAGE_SIZE }),
      loadCodeOptions(session.workspaceId, "C10100"),
      loadCodeOptions(session.workspaceId, "C10002"),
      loadCodeOptions(session.workspaceId, "C10005"),
    ]);

  const initialRows: CompanyRow[] = initialResult.ok
    ? (initialResult.rows as CompanyRow[])
    : [];
  const initialTotal = initialResult.ok ? Number(initialResult.total ?? 0) : 0;

  return (
    <PageShellFit title={t("title")}>
      <SalesCompaniesGridContainer
        initial={initialRows}
        total={initialTotal}
        objectDivOptions={objectDivOptions}
        groupOptions={groupOptions}
        industryOptions={industryOptions}
      />
    </PageShellFit>
  );
}
