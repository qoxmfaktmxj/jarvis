import { db } from '@jarvis/db/client';
import { attendance, outManage, outManageDetail } from '@jarvis/db/schema';
import { and, eq, gte, lte, desc, count, inArray } from 'drizzle-orm';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttendanceRecord = typeof attendance.$inferSelect;

export type TimeDetail = typeof outManageDetail.$inferSelect;

export type OutManageRecord = typeof outManage.$inferSelect & {
  details: TimeDetail[];
};

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OutManageFilters {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
  /** When true, returns records for all users in the workspace */
  allUsers?: boolean;
  userId?: string;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns all attendance records for a user in a given month.
 * @param month - YYYY-MM format, e.g. '2026-04'
 */
export async function getMonthlyAttendance(
  workspaceId: string,
  userId: string,
  month: string,
): Promise<AttendanceRecord[]> {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const mon = Number(parts[1]);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, workspaceId),
        eq(attendance.userId, userId),
        gte(attendance.attendDate, startDate),
        lte(attendance.attendDate, endDate),
      ),
    )
    .orderBy(attendance.attendDate);
}

/**
 * Returns a paginated list of out-manage requests.
 * When filters.allUsers is true, returns all users in the workspace (admin view).
 */
export async function getOutManageList(
  workspaceId: string,
  userId: string,
  filters: OutManageFilters = {},
): Promise<PaginatedResponse<OutManageRecord>> {
  const { page = 1, limit = 20, status, allUsers = false } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(outManage.workspaceId, workspaceId)];
  if (!allUsers) {
    conditions.push(eq(outManage.userId, userId));
  }
  if (status) {
    conditions.push(eq(outManage.status, status));
  }

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(outManage)
      .where(where)
      .orderBy(desc(outManage.outDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(outManage).where(where),
  ]);
  const total = countResult[0]?.total ?? 0;

  const detailsMap: Record<string, TimeDetail[]> = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const details = await db
      .select()
      .from(outManageDetail)
      .where(inArray(outManageDetail.outManageId, ids))
      .orderBy(outManageDetail.timeFrom);
    for (const d of details) {
      if (!detailsMap[d.outManageId]) detailsMap[d.outManageId] = [];
      detailsMap[d.outManageId]!.push(d);
    }
  }

  const data: OutManageRecord[] = rows.map((r) => ({
    ...r,
    details: detailsMap[r.id] ?? [],
  }));

  return {
    data,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}

/**
 * Returns a single out-manage record with all its time detail blocks.
 */
export async function getOutManageDetail(
  outManageId: string,
  workspaceId: string,
): Promise<OutManageRecord | null> {
  const [record] = await db
    .select()
    .from(outManage)
    .where(
      and(eq(outManage.id, outManageId), eq(outManage.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!record) return null;

  const details = await db
    .select()
    .from(outManageDetail)
    .where(eq(outManageDetail.outManageId, outManageId))
    .orderBy(outManageDetail.timeFrom);

  return { ...record, details };
}
