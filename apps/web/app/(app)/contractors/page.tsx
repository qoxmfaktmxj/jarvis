import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listLeaveRequests } from "@/lib/queries/contractors";
import { listHolidays } from "@/lib/queries/holidays";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { ScheduleCalendar } from "@/components/contractors/ScheduleCalendar";
import { requirePageSession } from "@/lib/server/page-auth";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "외주인력 일정" };
export const dynamic = "force-dynamic";

export default async function ContractorsSchedulePage({
  searchParams
}: PageProps) {
  const session = await requirePageSession(
    PERMISSIONS.CONTRACTOR_READ,
    "/dashboard"
  );

  const sp = await searchParams;
  const now = new Date();
  const month =
    typeof sp?.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const userIdFilter = isAdmin ? undefined : session.userId;

  const [leaves, holidays, contractors] = await Promise.all([
    listLeaveRequests({
      workspaceId: session.workspaceId,
      userId: userIdFilter,
      from: firstDay,
      to: lastDay
    }),
    listHolidays({ workspaceId: session.workspaceId, year: y }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(
        and(
          eq(user.workspaceId, session.workspaceId),
          eq(user.employmentType, "contractor")
        )
      )
  ]);

  const userName = new Map(contractors.map((c) => [c.id, c.name]));
  const enrichedLeaves = leaves.map((l) => ({
    ...l,
    userName: userName.get(l.userId) ?? "?",
    timeFrom: l.timeFrom?.toISOString() ?? null,
    timeTo: l.timeTo?.toISOString() ?? null,
    cancelledAt: l.cancelledAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString()
  }));

  const calendarLeaves = enrichedLeaves.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.userName,
    type: l.type,
    startDate: l.startDate,
    endDate: l.endDate,
    hours: l.hours,
    reason: l.reason ?? null
  }));

  return (
    <ScheduleCalendar
      month={month}
      leaves={calendarLeaves}
      holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
      currentUserId={session.userId}
      isAdmin={isAdmin}
    />
  );
}
