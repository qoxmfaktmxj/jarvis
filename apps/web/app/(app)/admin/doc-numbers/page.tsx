import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { DocNumbersGridContainer } from "./_components/DocNumbersGridContainer";
import { listDocumentNumbersAction, listDocumentYearsAction } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

export default async function DocNumbersPage() {
  const t = await getTranslations("DocNumbers.Page");
  const session = await requirePageSession(
    [PERMISSIONS.DOC_NUM_READ, PERMISSIONS.ADMIN_ALL],
    "/dashboard?error=forbidden",
  );

  const canWrite =
    hasPermission(session, PERMISSIONS.DOC_NUM_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);
  const canAdmin =
    hasPermission(session, PERMISSIONS.DOC_NUM_ADMIN) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const [initialResult, yearsResult] = await Promise.all([
    listDocumentNumbersAction({ page: 1, limit: DEFAULT_PAGE_SIZE }),
    listDocumentYearsAction(),
  ]);

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;
  const years = yearsResult.ok ? yearsResult.years : [];

  return (
    <div className="space-y-3">
      <PageHeader title={t("title")} />
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
