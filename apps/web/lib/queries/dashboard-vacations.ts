import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { leaveRequest, user, organization } from "@jarvis/db/schema";

export interface DashboardVacationRow {
  id: string;
  userId: string;
  userName: string;
  orgName: string | null;
  avatarUrl: string | null;
  type: string; // annual | halfAm | halfPm | sick | family
  startDate: string; // yyyy-mm-dd
  endDate: string;
  hours: number;
  reason: string | null;
  cancelledAt: Date | null;
  status: string; // approved | pending | rejected
}

export function computeWeekBounds(now: Date): {
  weekStart: string;
  weekEnd: string;
} {
  const offsetMs = 9 * 60 * 60 * 1000;
  const ko = new Date(now.getTime() + offsetMs);
  const dow = ko.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow; // Monday-start week
  const start = new Date(ko);
  start.setUTCDate(start.getUTCDate() + delta);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

export function filterWeekVacations(
  rows: DashboardVacationRow[],
  bounds: { weekStart: string; weekEnd: string }
): DashboardVacationRow[] {
  return rows.filter(
    (r) =>
      r.cancelledAt === null &&
      r.status === "approved" &&
      r.startDate <= bounds.weekEnd &&
      r.endDate >= bounds.weekStart
  );
}

export async function listWeekVacations(
  workspaceId: string,
  now: Date = new Date(),
  limit = 10,
  database: typeof db = db
): Promise<DashboardVacationRow[]> {
  const { weekStart, weekEnd } = computeWeekBounds(now);

  const rows = await database
    .select({
      id: leaveRequest.id,
      userId: leaveRequest.userId,
      userName: user.name,
      orgName: organization.name,
      avatarUrl: user.avatarUrl,
      type: leaveRequest.type,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      hours: leaveRequest.hours,
      reason: leaveRequest.reason,
      cancelledAt: leaveRequest.cancelledAt,
      status: leaveRequest.status
    })
    .from(leaveRequest)
    .innerJoin(user, eq(leaveRequest.userId, user.id))
    .leftJoin(organization, eq(user.orgId, organization.id))
    .where(
      and(
        eq(leaveRequest.workspaceId, workspaceId),
        isNull(leaveRequest.cancelledAt),
        eq(leaveRequest.status, "approved"),
        lte(leaveRequest.startDate, weekEnd),
        gte(leaveRequest.endDate, weekStart)
      )
    )
    .orderBy(asc(leaveRequest.startDate), asc(user.name))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    hours: Number(r.hours)
  })) as DashboardVacationRow[];
}
