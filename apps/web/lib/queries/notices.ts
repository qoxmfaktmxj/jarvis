import { db } from '@jarvis/db/client';
import { notice } from '@jarvis/db/schema/notice';
import { auditLog } from '@jarvis/db/schema/audit';
import { and, count, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { writeAuditLog } from '@jarvis/shared/audit-log';
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
 * Visibility window (publish + expiration):
 * - ADMIN: sees everything (no publishedAt filter, no expiresAt filter) — needs to
 *   audit/clean up expired notices.
 * - other roles:
 *     publishedAt: must be <= NOW() OR NULL (drafts with no publishedAt remain
 *       visible by design — author/admin can clean up)
 *     expiresAt:   must be > NOW() OR NULL (P0 F3 — expired notices must NOT
 *       leak into dashboards/detail views once their expiresAt has passed)
 */
function publishVisibilityCondition(actorRole?: string) {
  if (actorRole === 'ADMIN') return undefined;
  const now = new Date();
  const publishCond = or(lte(notice.publishedAt, now), isNull(notice.publishedAt));
  const notExpiredCond = or(isNull(notice.expiresAt), gt(notice.expiresAt, now));
  return and(publishCond, notExpiredCond);
}

export async function listNotices(
  opts: ListNoticesOptions,
): Promise<NoticeListResult> {
  const { workspaceId, page = 1, limit = 20, actorRole } = opts;
  const offset = (page - 1) * limit;

  const publishCond = publishVisibilityCondition(actorRole);

  const conds = [eq(notice.workspaceId, workspaceId)];
  if (publishCond) conds.push(publishCond);
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

export interface GetNoticeByIdOptions {
  /**
   * Actor role. ADMIN sees expired + unpublished notices (audit/cleanup);
   * other roles see only the publish window (publishedAt <= NOW AND
   * (expiresAt IS NULL OR expiresAt > NOW)).
   *
   * P0 F3 — expiresAt 필터를 listing 뿐 아니라 detail GET 에서도 적용.
   */
  actorRole?: string;
}

export async function getNoticeById(
  id: string,
  workspaceId: string,
  opts: GetNoticeByIdOptions = {},
): Promise<Notice | null> {
  const { actorRole } = opts;
  const rows = await db
    .select()
    .from(notice)
    .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // P0 F3 — actorRole 이 명시되었고 ADMIN 이 아니면 만료/미발행 notice 를 차단.
  // actorRole 이 미지정인 경우는 (예: NOTICE_UPDATE 권한자가 자기 글을 편집하려고
  // 조회하는 경로) 이전 동작 유지 — 호출자가 추가 ownership/role 검사를 수행한다.
  if (actorRole !== undefined && actorRole !== 'ADMIN') {
    const now = new Date();
    if (row.publishedAt && row.publishedAt > now) return null;
    if (row.expiresAt && row.expiresAt <= now) return null;
  }
  return row;
}

export async function createNotice(
  input: CreateNoticeInput,
  authorId: string,
  workspaceId: string,
): Promise<Notice> {
  // P0 F4 — mutation 경로에 audit_log insert 동반. INSERT + audit_log 를 동일
  // 트랜잭션에 묶어 부분 실패 시 둘 다 롤백되도록 한다.
  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(notice)
      .values({
        workspaceId,
        authorId,
        title: input.title,
        bodyMd: input.bodyMd,
        pinned: input.pinned,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning();
    const created = rows[0];
    if (!created) throw new Error('Failed to insert notice');

    await writeAuditLog(tx, auditLog, {
      workspaceId,
      userId: authorId,
      action: 'notice.create',
      resourceType: 'notice',
      resourceId: created.id,
      details: {
        title: created.title,
        pinned: created.pinned,
        publishedAt: created.publishedAt?.toISOString() ?? null,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
      success: true,
    });

    return created;
  });
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

  // Pre-update snapshot of fields that may change — used as `before` payload
  // for audit_log diff. Mirrors infra/actions.ts diff pattern.
  const before = {
    title: existing.title,
    bodyMd: existing.bodyMd,
    pinned: existing.pinned,
    publishedAt: existing.publishedAt?.toISOString() ?? null,
    expiresAt: existing.expiresAt?.toISOString() ?? null,
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const after: Record<string, unknown> = {};
  if (input.title !== undefined) {
    patch.title = input.title;
    after.title = input.title;
  }
  if (input.bodyMd !== undefined) {
    patch.bodyMd = input.bodyMd;
    after.bodyMd = input.bodyMd;
  }
  if (input.pinned !== undefined) {
    patch.pinned = input.pinned;
    after.pinned = input.pinned;
  }
  if (input.publishedAt !== undefined) {
    const v = input.publishedAt ? new Date(input.publishedAt) : null;
    patch.publishedAt = v;
    after.publishedAt = v?.toISOString() ?? null;
  }
  if (input.expiresAt !== undefined) {
    const v = input.expiresAt ? new Date(input.expiresAt) : null;
    patch.expiresAt = v;
    after.expiresAt = v?.toISOString() ?? null;
  }

  // P0 F4 — UPDATE + audit_log 를 동일 트랜잭션에 묶는다.
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(notice)
      .set(patch)
      .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
      .returning();
    const updated = rows[0];
    if (!updated) throw new Error('Notice not found');

    await writeAuditLog(tx, auditLog, {
      workspaceId,
      userId: actor.id,
      action: 'notice.update',
      resourceType: 'notice',
      resourceId: updated.id,
      before,
      after,
      success: true,
    });

    return updated;
  });
}

export async function deleteNotice(
  id: string,
  actor: { id: string; role: string },
  workspaceId: string,
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Forbidden');
  }
  // P0 F4 — DELETE + audit_log 를 동일 트랜잭션에 묶고, 삭제 전 메타데이터를
  // 캡쳐해 audit details 에 보존한다 (삭제 이후 row 가 사라지므로).
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: notice.id,
        title: notice.title,
        authorId: notice.authorId,
        pinned: notice.pinned,
        publishedAt: notice.publishedAt,
        expiresAt: notice.expiresAt,
      })
      .from(notice)
      .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
      .limit(1);

    const result = await tx
      .delete(notice)
      .where(and(eq(notice.id, id), eq(notice.workspaceId, workspaceId)))
      .returning({ id: notice.id });

    await writeAuditLog(tx, auditLog, {
      workspaceId,
      userId: actor.id,
      action: 'notice.delete',
      resourceType: 'notice',
      resourceId: id,
      details: existing
        ? {
            title: existing.title,
            authorId: existing.authorId,
            pinned: existing.pinned,
            publishedAt: existing.publishedAt?.toISOString() ?? null,
            expiresAt: existing.expiresAt?.toISOString() ?? null,
            deletedRowCount: result.length,
          }
        : { deletedRowCount: result.length },
      success: true,
    });
  });
}
