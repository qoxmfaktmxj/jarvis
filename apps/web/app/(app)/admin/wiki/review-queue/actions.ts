"use server";

/**
 * apps/web/app/(app)/admin/wiki/review-queue/actions.ts
 *
 * Phase-W3 T5 — Wiki review queue approve/reject server actions.
 *
 * - `wiki_review_queue` 전용 approve/reject 플로우. 기존
 *   `apps/web/app/(app)/admin/review-queue/actions.ts`(legacy `review_request`)
 *   와 테이블이 다르므로 분리한다.
 * - 모든 action은 세션 + `KNOWLEDGE_REVIEW`(또는 ADMIN_ALL) 권한을 요구한다.
 * - approve/reject 시 `status` 전환 + payload에 감사 필드(approvedBy, approvedAt,
 *   notes / rejectedBy, rejectedAt, rejectionReason) 머지 + `reviewedAt` /
 *   `reviewedByUserId` 기록.
 * - `affectedPages`가 있으면 해당 `wiki_page_index` 행들의 `stale = true`로 올려
 *   재-ingest/reindex가 필요함을 표시한다.
 */

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@jarvis/db/client";
import {
  auditLog,
  wikiPageIndex,
  wikiReviewQueue,
} from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

type ActionResult = { ok: boolean; error?: string };

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

async function resolveContext(): Promise<
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      ipAddress: string | null;
      userAgent: string | null;
    }
  | { ok: false; error: string }
> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "unauthorized" };

  if (
    !isAdmin(session) &&
    !hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW)
  ) {
    return { ok: false, error: "forbidden" };
  }

  const headerStore = await headers();
  return {
    ok: true,
    userId: session.userId,
    workspaceId: session.workspaceId,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

async function loadOwnedItem(id: string, workspaceId: string) {
  const rows = await db
    .select({
      id: wikiReviewQueue.id,
      status: wikiReviewQueue.status,
      payload: wikiReviewQueue.payload,
      affectedPages: wikiReviewQueue.affectedPages,
    })
    .from(wikiReviewQueue)
    .where(
      and(
        eq(wikiReviewQueue.id, id),
        eq(wikiReviewQueue.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function markAffectedPagesStale(
  affectedPages: string[] | null | undefined,
  workspaceId: string,
): Promise<void> {
  if (!affectedPages || affectedPages.length === 0) return;
  await db
    .update(wikiPageIndex)
    .set({ stale: true, updatedAt: new Date() })
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        inArray(wikiPageIndex.id, affectedPages),
      ),
    );
}

export async function approveReviewItem(
  id: string,
  notes?: string,
): Promise<ActionResult> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const owned = await loadOwnedItem(id, ctx.workspaceId);
    if (!owned) return { ok: false, error: "not_found" };
    if (owned.status !== "pending") {
      return { ok: false, error: "already_resolved" };
    }

    const reviewedAt = new Date();
    const prevPayload =
      (owned.payload as Record<string, unknown> | null | undefined) ?? {};
    const nextPayload: Record<string, unknown> = {
      ...prevPayload,
      approvedBy: ctx.userId,
      approvedAt: reviewedAt.toISOString(),
      ...(notes && notes.trim().length > 0
        ? { notes: notes.trim() }
        : {}),
    };

    await db
      .update(wikiReviewQueue)
      .set({
        status: "approved",
        reviewedAt,
        reviewedByUserId: ctx.userId,
        payload: nextPayload,
      })
      .where(
        and(
          eq(wikiReviewQueue.id, id),
          eq(wikiReviewQueue.workspaceId, ctx.workspaceId),
          eq(wikiReviewQueue.status, "pending"),
        ),
      );

    await markAffectedPagesStale(owned.affectedPages, ctx.workspaceId);

    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "wiki_review.approve",
      resourceType: "wiki_review_queue",
      resourceId: id,
      ipAddress: ctx.ipAddress as unknown as string | null,
      userAgent: ctx.userAgent,
      details: { notes: notes ?? null },
      success: true,
    });
  } catch (err) {
    console.error("wiki-review-queue.approve failed:", err);
    return { ok: false, error: "approve_failed" };
  }

  revalidatePath("/admin/wiki/review-queue");
  return { ok: true };
}

export async function rejectReviewItem(
  id: string,
  reason: string,
): Promise<ActionResult> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return { ok: false, error: "reason_required" };
  }

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const owned = await loadOwnedItem(id, ctx.workspaceId);
    if (!owned) return { ok: false, error: "not_found" };
    if (owned.status !== "pending") {
      return { ok: false, error: "already_resolved" };
    }

    const reviewedAt = new Date();
    const prevPayload =
      (owned.payload as Record<string, unknown> | null | undefined) ?? {};
    const nextPayload: Record<string, unknown> = {
      ...prevPayload,
      rejectedBy: ctx.userId,
      rejectedAt: reviewedAt.toISOString(),
      rejectionReason: reason.trim(),
    };

    await db
      .update(wikiReviewQueue)
      .set({
        status: "rejected",
        reviewedAt,
        reviewedByUserId: ctx.userId,
        payload: nextPayload,
      })
      .where(
        and(
          eq(wikiReviewQueue.id, id),
          eq(wikiReviewQueue.workspaceId, ctx.workspaceId),
          eq(wikiReviewQueue.status, "pending"),
        ),
      );

    await markAffectedPagesStale(owned.affectedPages, ctx.workspaceId);

    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "wiki_review.reject",
      resourceType: "wiki_review_queue",
      resourceId: id,
      ipAddress: ctx.ipAddress as unknown as string | null,
      userAgent: ctx.userAgent,
      details: { reason: reason.trim() },
      success: true,
    });
  } catch (err) {
    console.error("wiki-review-queue.reject failed:", err);
    return { ok: false, error: "reject_failed" };
  }

  revalidatePath("/admin/wiki/review-queue");
  return { ok: true };
}
