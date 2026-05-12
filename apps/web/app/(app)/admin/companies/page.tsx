import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { CompaniesGridContainer } from "./_components/CompaniesGridContainer";
import { listCompanies } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export default async function AdminCompaniesPage() {
  const t = await getTranslations("Admin.Companies");
  const session = await requirePageSession(PERMISSIONS.ADMIN_ALL, "/dashboard?error=forbidden");

  const [initialResult, objectDivOptions, groupOptions, industryOptions] = await Promise.all([
    listCompanies({ page: 1, limit: DEFAULT_PAGE_SIZE }),
    loadCodeOptions(session.workspaceId, "C10100"),
    loadCodeOptions(session.workspaceId, "C10002"),
    loadCodeOptions(session.workspaceId, "C10005"),
  ]);

  const initialRows: CompanyRow[] = initialResult.ok ? (initialResult.rows as CompanyRow[]) : [];
  const initialTotal: number = initialResult.ok ? (initialResult.total as number) : 0;

  return (
    <div className="space-y-6">
      <PageHeader

               title={t("title")}
             />
      <CompaniesGridContainer
        initial={initialRows}
        total={initialTotal}
        objectDivOptions={objectDivOptions}
        groupOptions={groupOptions}
        industryOptions={industryOptions}
      />
    </div>
  );
}
