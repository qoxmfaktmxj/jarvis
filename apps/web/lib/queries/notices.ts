import { db } from '@jarvis/db/client';
import { notice } from '@jarvis/db/schema/notice';
import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type {
  CreateNoticeInput,
  UpdateNoticeInput,
} from '@jarvis/shared/validation';

export type Notice = typeof notice.$inferSelect;

/**
 * P1 #10 — INTERNAL sensitivity 공지를 열람 가능한 내부 직원 role 집합.
 * VIEWER (외주/계약직 등 외부) 는 PUBLIC 만 열람 가능.
 * 사용자가 이 set 의 role 중 하나라도 보유하면 INTERNAL 노출.
 */
export const INTERNAL_TIER_ROLES = new Set(['ADMIN', 'MANAGER', 'HR', 'DEVELOPER']);

export function canViewInternalNotice(roles: ReadonlyArray<string>): boolean {
  return roles.some((r) => INTERNAL_TIER_ROLES.has(r));
}

export interface ListNoticesOptions {
  workspaceId: string;
  page?: number;
  limit?: number;
  /** Actor role — used to decide whether to expose future-scheduled notices. */
  actorRole?: string;
  /** Actor id — used to allow authors to see their own future-scheduled notices. */
  actorId?: string;
  /**
   * P1 #10 — INTERNAL sensitivity 공지 열람 권한.
   * `false` 또는 미지정 시 PUBLIC 만 노출. 라우트가 `canViewInternalNotice(session.roles)` 로 계산해서 주입.
   */
  canViewInternal?: boolean;
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
  const { workspaceId, page = 1, limit = 20, actorRole, canViewInternal = false } = opts;
  const offset = (page - 1) * limit;

  const publishCond = publishVisibilityCondition(actorRole);
  // P1 #10 — INTERNAL 공지는 내부 직원만. 외부(VIEWER) 는 PUBLIC 만.
  const sensitivityCond = canViewInternal
    ? undefined
    : eq(notice.sensitivity, 'PUBLIC');

  const conds = [eq(notice.workspaceId, workspaceId)];
  if (publishCond) conds.push(publishCond);
  if (sensitivityCond) conds.push(sensitivityCond);
  const where = conds.length === 1 ? conds[0] : and(...conds);

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
  canViewInternal = false,
): Promise<Notice | null> {
  const rows = await db
    .select()
    .from(notice)
    .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // P1 #10 — INTERNAL 공지를 권한 없는 사용자에겐 404 동등하게 숨김.
  if (row.sensitivity === 'INTERNAL' && !canViewInternal) return null;
  return row;
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
  // updateNotice 진입 시점에 caller 는 NOTICE_UPDATE 권한을 이미 통과했으므로
  // INTERNAL 노출 금지 게이트를 우회한다 (canViewInternal=true).
  const existing = await getNoticeById(id, workspaceId, true);
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
