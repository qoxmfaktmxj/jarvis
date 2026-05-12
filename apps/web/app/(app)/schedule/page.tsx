import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ScheduleTabsClient } from "./_components/ScheduleTabsClient";
import { listSchedulesAction } from "./actions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

export default async function SchedulePage() {
  const t = await getTranslations("Schedule.Page");
  const session = await requirePageSession(
    [PERMISSIONS.SCHEDULE_READ, PERMISSIONS.ADMIN_ALL],
    "/dashboard?error=forbidden",
  );

  const canWrite =
    hasPermission(session, PERMISSIONS.SCHEDULE_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const initialResult = await listSchedulesAction({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    ownOnly: true,
  });

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <ScheduleTabsClient
        initialRows={initialRows}
        initialTotal={initialTotal}
        canWrite={canWrite}
      />
    </div>
  );
}
