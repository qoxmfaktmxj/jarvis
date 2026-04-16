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
 *
 * 동시성 안전:
 * - approve/reject 전체를 단일 `db.transaction()` 내에서 실행.
 * - UPDATE 시 `.returning()` 으로 영향 행 수를 검증 → 0 행이면 다른 프로세스가
 *   먼저 처리한 것으로 간주해 side-effect(stale 마킹, audit 로그)를 실행하지 않는다.
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

export async function approveReviewItem(
  id: string,
  notes?: string,
): Promise<ActionResult> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // 예상된(비-예외) 중단 코드를 트랜잭션 밖으로 전달하는 sentinel
  let txErrorCode: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
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
            eq(wikiReviewQueue.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);

      const owned = rows[0] ?? null;
      if (!owned) {
        txErrorCode = "not_found";
        throw new Error("tx_abort");
      }
      if (owned.status !== "pending") {
        txErrorCode = "already_resolved";
        throw new Error("tx_abort");
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

      const updated = await tx
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
        )
        .returning({ id: wikiReviewQueue.id });

      // 다른 요청이 먼저 처리한 경우 — side-effect 없이 중단
      if (updated.length === 0) {
        txErrorCode = "already_resolved";
        throw new Error("tx_abort");
      }

      if (owned.affectedPages && owned.affectedPages.length > 0) {
        await tx
          .update(wikiPageIndex)
          .set({ stale: true, updatedAt: new Date() })
          .where(
            and(
              eq(wikiPageIndex.workspaceId, ctx.workspaceId),
              inArray(wikiPageIndex.id, owned.affectedPages),
            ),
          );
      }

      await tx.insert(auditLog).values({
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
    });
  } catch (err) {
    if (txErrorCode) return { ok: false, error: txErrorCode };
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

  let txErrorCode: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
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
            eq(wikiReviewQueue.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);

      const owned = rows[0] ?? null;
      if (!owned) {
        txErrorCode = "not_found";
        throw new Error("tx_abort");
      }
      if (owned.status !== "pending") {
        txErrorCode = "already_resolved";
        throw new Error("tx_abort");
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

      const updated = await tx
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
        )
        .returning({ id: wikiReviewQueue.id });

      if (updated.length === 0) {
        txErrorCode = "already_resolved";
        throw new Error("tx_abort");
      }

      if (owned.affectedPages && owned.affectedPages.length > 0) {
        await tx
          .update(wikiPageIndex)
          .set({ stale: true, updatedAt: new Date() })
          .where(
            and(
              eq(wikiPageIndex.workspaceId, ctx.workspaceId),
              inArray(wikiPageIndex.id, owned.affectedPages),
            ),
          );
      }

      await tx.insert(auditLog).values({
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
    });
  } catch (err) {
    if (txErrorCode) return { ok: false, error: txErrorCode };
    console.error("wiki-review-queue.reject failed:", err);
    return { ok: false, error: "reject_failed" };
  }

  revalidatePath("/admin/wiki/review-queue");
  return { ok: true };
}
