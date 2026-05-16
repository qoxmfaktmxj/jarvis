import { getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { codeGroup, codeItem } from "@jarvis/db/schema";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { FaqGridContainer } from "./_components/FaqGridContainer";
import { listFaqAction } from "./actions";
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

export default async function FaqPage() {
  const t = await getTranslations("Faq.Page");
  const session = await requirePageSession(
    [PERMISSIONS.FAQ_READ, PERMISSIONS.ADMIN_ALL],
    "/dashboard?error=forbidden",
  );

  const canWrite =
    hasPermission(session, PERMISSIONS.FAQ_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);
  const canAdmin =
    hasPermission(session, PERMISSIONS.FAQ_ADMIN) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const [initialResult, bizCodeOptions] = await Promise.all([
    listFaqAction({ page: 1, limit: DEFAULT_PAGE_SIZE }),
    loadCodeOptions(session.workspaceId, "C10080"),
  ]);

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;

  return (
    <div className="space-y-3">
      <PageHeader title={t("title")} />
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
