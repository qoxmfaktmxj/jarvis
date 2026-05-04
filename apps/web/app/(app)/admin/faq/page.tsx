import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { FaqGridContainer } from "./_components/FaqGridContainer";
import { listFaqAction } from "./actions";

async function loadCodeOptions(workspaceId: string, groupCode: string) {
  const rows = await db
    .select({ code: codeItem.code, name: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(eq(codeGroup.workspaceId, workspaceId), eq(codeGroup.code, groupCode)))
    .orderBy(codeItem.code);
  return rows.map((r) => ({ value: r.code, label: r.name }));
}

export default async function FaqPage() {
  const t = await getTranslations("Faq.Page");
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (
    !session ||
    !(
      hasPermission(session, PERMISSIONS.FAQ_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL)
    )
  ) {
    redirect("/dashboard?error=forbidden");
  }

  const canWrite =
    hasPermission(session, PERMISSIONS.FAQ_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);
  const canAdmin =
    hasPermission(session, PERMISSIONS.FAQ_ADMIN) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const [initialResult, bizCodeOptions] = await Promise.all([
    listFaqAction({ page: 1, limit: 50 }),
    loadCodeOptions(session.workspaceId, "C10080"),
  ]);

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · FAQ"
        title={t("title")}
        description={t("subtitle")}
      />
      <FaqGridContainer
        initial={initialRows}
        total={initialTotal}
        bizCodeOptions={bizCodeOptions}
        canWrite={canWrite}
        canAdmin={canAdmin}
      />
    </div>
  );
}
