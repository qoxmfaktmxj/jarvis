import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { PageHeader } from "@/components/patterns/PageHeader";
import { SalesCompaniesGridContainer } from "./_components/SalesCompaniesGridContainer";
import { listSalesCompanies } from "./actions";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const t = await getTranslations("Sales.Companies");

  const [initialResult, objectDivOptions, groupOptions, industryOptions] =
    await Promise.all([
      listSalesCompanies({ page: 1, limit: 50 }),
      loadCodeOptions(session.workspaceId, "C10100"),
      loadCodeOptions(session.workspaceId, "C10002"),
      loadCodeOptions(session.workspaceId, "C10005"),
    ]);

  const initialRows: CompanyRow[] = initialResult.ok
    ? (initialResult.rows as CompanyRow[])
    : [];
  const initialTotal = initialResult.ok ? Number(initialResult.total ?? 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Companies"
        title={t("title")}
        description={t("description")}
      />
      <SalesCompaniesGridContainer
        initial={initialRows}
        total={initialTotal}
        objectDivOptions={objectDivOptions}
        groupOptions={groupOptions}
        industryOptions={industryOptions}
      />
    </div>
  );
}
