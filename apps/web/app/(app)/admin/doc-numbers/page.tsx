import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { DocNumbersGridContainer } from "./_components/DocNumbersGridContainer";
import { listDocumentNumbersAction, listDocumentYearsAction } from "./actions";

export default async function DocNumbersPage() {
  const t = await getTranslations("DocNumbers.Page");
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (
    !session ||
    !(
      hasPermission(session, PERMISSIONS.DOC_NUM_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL)
    )
  ) {
    redirect("/dashboard?error=forbidden");
  }

  const canWrite =
    hasPermission(session, PERMISSIONS.DOC_NUM_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);
  const canAdmin =
    hasPermission(session, PERMISSIONS.DOC_NUM_ADMIN) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const [initialResult, yearsResult] = await Promise.all([
    listDocumentNumbersAction({ page: 1, limit: 50 }),
    listDocumentYearsAction(),
  ]);

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;
  const years = yearsResult.ok ? yearsResult.years : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Document Numbers"
        title={t("title")}
        description={t("subtitle")}
      />
      <DocNumbersGridContainer
        initial={initialRows}
        total={initialTotal}
        availableYears={years}
        canWrite={canWrite}
        canAdmin={canAdmin}
      />
    </div>
  );
}
