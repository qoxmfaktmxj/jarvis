import { db } from '@jarvis/db/client';
import { notice } from '@jarvis/db/schema/notice';
import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type {
  CreateNoticeInput,
  UpdateNoticeInput,
} from '@jarvis/shared/validation';

export type Notice = typeof notice.$inferSelect;

export interface ListNoticesOptions {
  workspaceId: string;
  page?: number;
  limit?: number;
  /** Actor role — used to decide whether to expose future-scheduled notices. */
  actorRole?: string;
  /** Actor id — used to allow authors to see their own future-scheduled notices. */
  actorId?: string;
}

export interface NoticeListResult {
  data: Notice[];
  total: number;
}

/**
 * Future-scheduled visibility:
 * - ADMIN: sees everything (no publishedAt filter)
 * - other roles: only published_at <= NOW() OR published_at IS NULL
 *   (drafts with no publishedAt remain visible by design — author/admin can clean up)
 */
function publishVisibilityCondition(actorRole?: string) {
  if (actorRole === 'ADMIN') return undefined;
  return or(lte(notice.publishedAt, new Date()), isNull(notice.publishedAt));
}

export async function listNotices(
  opts: ListNoticesOptions,
): Promise<NoticeListResult> {
  const { workspaceId, page = 1, limit = 20, actorRole } = opts;
  const offset = (page - 1) * limit;

  const publishCond = publishVisibilityCondition(actorRole);
  const where = publishCond
    ? and(eq(notice.workspaceId, workspaceId), publishCond)
    : eq(notice.workspaceId, workspaceId);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(notice)
      .where(where)
      .orderBy(desc(notice.pinned), desc(notice.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(notice).where(where),
  ]);

  return { data: rows, total: Number(totalRows[0]?.value ?? 0) };
}

export async function getNoticeById(
  id: string,
  workspaceId: string,
): Promise<Notice | null> {
  const rows = await db
    .select()
    .from(notice)
    .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createNotice(
  input: CreateNoticeInput,
  authorId: string,
  workspaceId: string,
): Promise<Notice> {
  const rows = await db
    .insert(notice)
    .values({
      workspaceId,
      authorId,
      title: input.title,
      bodyMd: input.bodyMd,
      sensitivity: input.sensitivity,
      pinned: input.pinned,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();
  if (!rows[0]) throw new Error('Failed to insert notice');
  return rows[0];
}

export async function updateNotice(
  id: string,
  input: UpdateNoticeInput,
  actor: { id: string; role: string },
  workspaceId: string,
): Promise<Notice> {
  const existing = await getNoticeById(id, workspaceId);
  if (!existing) {
    throw new Error('Notice not found');
  }
  if (actor.role !== 'ADMIN' && existing.authorId !== actor.id) {
    throw new Error('Forbidden');
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.bodyMd !== undefined) patch.bodyMd = input.bodyMd;
  if (input.sensitivity !== undefined) patch.sensitivity = input.sensitivity;
  if (input.pinned !== undefined) patch.pinned = input.pinned;
  if (input.publishedAt !== undefined) {
    patch.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  }
  if (input.expiresAt !== undefined) {
    patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }

  const rows = await db
    .update(notice)
    .set(patch)
    .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
    .returning();
  if (!rows[0]) throw new Error('Notice not found');
  return rows[0];
}

export async function deleteNotice(
  id: string,
  actor: { id: string; role: string },
  workspaceId: string,
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Forbidden');
  }
  await db
    .delete(notice)
    .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)));
}
