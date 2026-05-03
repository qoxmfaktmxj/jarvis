import { db } from "@jarvis/db/client";
import { scheduleEvent, user } from "@jarvis/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface ScheduleRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmployeeId: string | null;
  startDate: string;
  endDate: string;
  title: string;
  memo: string | null;
  orderSeq: number;
  isShared: boolean;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
  isOwn: boolean;
}

export interface ListSchedulesParams {
  workspaceId: string;
  /** 현재 세션 사용자 (isOwn 계산 + ownOnly 필터링용) */
  sessionUserId: string;
  q?: string;
  activeOn?: string;
  /** YYYY-MM. 한 달에 걸쳐 있는 일정. */
  month?: string;
  /** true: 본인 일정만 / false: 본인 + 공유받은(isShared=true) 일정 */
  ownOnly?: boolean;
  page?: number;
  limit?: number;
  database?: DbOrTx;
}

export async function listSchedules({
  workspaceId,
  sessionUserId,
  q,
  activeOn,
  month,
  ownOnly = true,
  page = 1,
  limit = 50,
  database = db,
}: ListSchedulesParams): Promise<{
  data: ScheduleRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(500, Math.max(1, limit));

  const conds = [eq(scheduleEvent.workspaceId, workspaceId)];

  if (ownOnly) {
    conds.push(eq(scheduleEvent.userId, sessionUserId));
  } else {
    conds.push(
      or(
        eq(scheduleEvent.userId, sessionUserId),
        eq(scheduleEvent.isShared, true),
      )!,
    );
  }

  if (activeOn) {
    conds.push(lte(scheduleEvent.startDate, activeOn));
    conds.push(gte(scheduleEvent.endDate, activeOn));
  }

  if (month) {
    // YYYY-MM → YYYY-MM-01 ~ YYYY-MM-31 사이에 걸쳐 있는 일정
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    conds.push(lte(scheduleEvent.startDate, monthEnd));
    conds.push(gte(scheduleEvent.endDate, monthStart));
  }

  if (q && q.trim().length > 0) {
    const escaped = escapeLike(q.trim());
    const pattern = `%${escaped}%`;
    conds.push(or(ilike(scheduleEvent.title, pattern), ilike(scheduleEvent.memo, pattern))!);
  }

  const rows = await database
    .select({
      id: scheduleEvent.id,
      userId: scheduleEvent.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      startDate: scheduleEvent.startDate,
      endDate: scheduleEvent.endDate,
      title: scheduleEvent.title,
      memo: scheduleEvent.memo,
      orderSeq: scheduleEvent.orderSeq,
      isShared: scheduleEvent.isShared,
      updatedBy: scheduleEvent.updatedBy,
      updatedAt: scheduleEvent.updatedAt,
      createdAt: scheduleEvent.createdAt,
    })
    .from(scheduleEvent)
    .leftJoin(user, eq(scheduleEvent.userId, user.id))
    .where(and(...conds))
    .orderBy(desc(scheduleEvent.startDate), asc(scheduleEvent.orderSeq))
    .limit(safeLimit)
    .offset((safePage - 1) * safeLimit);

  const [totals] = await database
    .select({ total: sql<number>`count(*)` })
    .from(scheduleEvent)
    .leftJoin(user, eq(scheduleEvent.userId, user.id))
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  const data: ScheduleRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    startDate: r.startDate,
    endDate: r.endDate,
    title: r.title,
    memo: r.memo,
    orderSeq: r.orderSeq,
    isShared: r.isShared,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    isOwn: r.userId === sessionUserId,
  }));

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export async function getScheduleById({
  workspaceId,
  id,
  sessionUserId,
  database = db,
}: {
  workspaceId: string;
  id: string;
  sessionUserId: string;
  database?: DbOrTx;
}): Promise<ScheduleRow | null> {
  const [row] = await database
    .select({
      id: scheduleEvent.id,
      userId: scheduleEvent.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      startDate: scheduleEvent.startDate,
      endDate: scheduleEvent.endDate,
      title: scheduleEvent.title,
      memo: scheduleEvent.memo,
      orderSeq: scheduleEvent.orderSeq,
      isShared: scheduleEvent.isShared,
      updatedBy: scheduleEvent.updatedBy,
      updatedAt: scheduleEvent.updatedAt,
      createdAt: scheduleEvent.createdAt,
    })
    .from(scheduleEvent)
    .leftJoin(user, eq(scheduleEvent.userId, user.id))
    .where(
      and(
        eq(scheduleEvent.id, id),
        eq(scheduleEvent.workspaceId, workspaceId),
      ),
    );

  if (!row) return null;

  // sensitivity check: 본인 또는 공유된 일정만 노출
  if (row.userId !== sessionUserId && !row.isShared) return null;

  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmployeeId: row.userEmployeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    title: row.title,
    memo: row.memo,
    orderSeq: row.orderSeq,
    isShared: row.isShared,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    isOwn: row.userId === sessionUserId,
  };
}

/** 캘린더 뷰: 본인 + 공유 일정. 기간 범위 검색 (max 92일). */
export async function listCalendarEvents({
  workspaceId,
  sessionUserId,
  fromDate,
  toDate,
  database = db,
}: {
  workspaceId: string;
  sessionUserId: string;
  fromDate: string;
  toDate: string;
  database?: DbOrTx;
}): Promise<ScheduleRow[]> {
  const conds = [
    eq(scheduleEvent.workspaceId, workspaceId),
    or(
      eq(scheduleEvent.userId, sessionUserId),
      eq(scheduleEvent.isShared, true),
    )!,
    lte(scheduleEvent.startDate, toDate),
    gte(scheduleEvent.endDate, fromDate),
  ];

  const rows = await database
    .select({
      id: scheduleEvent.id,
      userId: scheduleEvent.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      startDate: scheduleEvent.startDate,
      endDate: scheduleEvent.endDate,
      title: scheduleEvent.title,
      memo: scheduleEvent.memo,
      orderSeq: scheduleEvent.orderSeq,
      isShared: scheduleEvent.isShared,
      updatedBy: scheduleEvent.updatedBy,
      updatedAt: scheduleEvent.updatedAt,
      createdAt: scheduleEvent.createdAt,
    })
    .from(scheduleEvent)
    .leftJoin(user, eq(scheduleEvent.userId, user.id))
    .where(and(...conds))
    .orderBy(asc(scheduleEvent.startDate), asc(scheduleEvent.orderSeq));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    startDate: r.startDate,
    endDate: r.endDate,
    title: r.title,
    memo: r.memo,
    orderSeq: r.orderSeq,
    isShared: r.isShared,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    isOwn: r.userId === sessionUserId,
  }));
}

/** 다음 orderSeq 계산 (같은 user + startDate 내에서 단조 증가) */
export async function nextOrderSeq({
  userId,
  startDate,
  database = db,
}: {
  userId: string;
  startDate: string;
  database?: DbOrTx;
}): Promise<number> {
  const [row] = await database
    .select({ max: sql<number>`COALESCE(max(${scheduleEvent.orderSeq}), -1)` })
    .from(scheduleEvent)
    .where(
      and(
        eq(scheduleEvent.userId, userId),
        eq(scheduleEvent.startDate, startDate),
      ),
    );
  return Number(row?.max ?? -1) + 1;
}
