import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CompaniesGrid } from "./_components/CompaniesGrid";
import { listCompanies } from "./actions";

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
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const [initialResult, objectDivOptions, groupOptions, industryOptions] = await Promise.all([
    listCompanies({ page: 1, limit: 50 }),
    loadCodeOptions(session.workspaceId, "C10100"),
    loadCodeOptions(session.workspaceId, "C10002"),
    loadCodeOptions(session.workspaceId, "C10005"),
  ]);

  const initialRows: CompanyRow[] = initialResult.ok ? (initialResult.rows as CompanyRow[]) : [];
  const initialTotal: number = initialResult.ok ? (initialResult.total as number) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Companies"
        title={t("title")}
        description={t("description")}
      />
      <CompaniesGrid
        initial={initialRows}
        total={initialTotal}
        objectDivOptions={objectDivOptions}
        groupOptions={groupOptions}
        industryOptions={industryOptions}
      />
    </div>
  );
}
