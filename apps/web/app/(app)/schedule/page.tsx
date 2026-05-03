import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ScheduleTabsClient } from "./_components/ScheduleTabsClient";
import { listSchedulesAction } from "./actions";

export default async function SchedulePage() {
  const t = await getTranslations("Schedule.Page");
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (
    !session ||
    !(
      hasPermission(session, PERMISSIONS.SCHEDULE_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL)
    )
  ) {
    redirect("/dashboard?error=forbidden");
  }

  const canWrite =
    hasPermission(session, PERMISSIONS.SCHEDULE_WRITE) ||
    hasPermission(session, PERMISSIONS.ADMIN_ALL);

  const initialResult = await listSchedulesAction({
    page: 1,
    limit: 50,
    ownOnly: true,
  });

  const initialRows = initialResult.ok ? initialResult.rows : [];
  const initialTotal = initialResult.ok ? initialResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · Schedule"
        title={t("title")}
        description={t("subtitle")}
      />
      <ScheduleTabsClient
        initialRows={initialRows}
        initialTotal={initialTotal}
        canWrite={canWrite}
      />
    </div>
  );
}
