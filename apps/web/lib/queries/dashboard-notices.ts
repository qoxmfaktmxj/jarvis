import { and, desc, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { notice, user } from "@jarvis/db/schema";
import { eq } from "drizzle-orm";

export interface DashboardNoticeRow {
  id: string;
  title: string;
  bodyMd: string;
  sensitivity: "PUBLIC" | "INTERNAL";
  pinned: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export function filterDashboardNotices(
  rows: DashboardNoticeRow[],
  now: Date = new Date()
): DashboardNoticeRow[] {
  return rows.filter(
    (r) =>
      r.publishedAt !== null &&
      (r.expiresAt === null || r.expiresAt.getTime() > now.getTime())
  );
}

export function orderDashboardNotices(
  rows: DashboardNoticeRow[]
): DashboardNoticeRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const pa = a.publishedAt?.getTime() ?? 0;
    const pb = b.publishedAt?.getTime() ?? 0;
    return pb - pa;
  });
}

export async function listDashboardNotices(
  workspaceId: string,
  limit = 5,
  now: Date = new Date(),
  database: typeof db = db
): Promise<DashboardNoticeRow[]> {
  const rows = await database
    .select({
      id: notice.id,
      title: notice.title,
      bodyMd: notice.bodyMd,
      sensitivity: notice.sensitivity,
      pinned: notice.pinned,
      publishedAt: notice.publishedAt,
      expiresAt: notice.expiresAt,
      authorId: notice.authorId,
      authorName: user.name,
      createdAt: notice.createdAt
    })
    .from(notice)
    .innerJoin(user, eq(notice.authorId, user.id))
    .where(
      and(
        eq(notice.workspaceId, workspaceId),
        isNotNull(notice.publishedAt),
        or(isNull(notice.expiresAt), gt(notice.expiresAt, sql`${now}::timestamptz`))
      )
    )
    .orderBy(desc(notice.pinned), desc(notice.publishedAt))
    .limit(limit);

  return rows as DashboardNoticeRow[];
}
