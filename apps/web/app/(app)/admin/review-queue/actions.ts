"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { db } from "@jarvis/db/client";
import { auditLog, reviewRequest } from "@jarvis/db/schema";
import {
  approveCommentSchema,
  rejectReasonSchema,
  deferSchema,
} from "@jarvis/shared/validation";

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

// P1 #5 — review-queue legacy server action 은 KNOWLEDGE_REVIEW 또는 ADMIN_ALL
// 권한이 있어야만 approve/reject/defer 를 수행할 수 있어야 한다.
// 이전엔 세션만 확인하고 권한 검증이 없어서 일반 직원이 review 결정을 내릴 수 있었음.
async function resolveContext(): Promise<
  | { ok: true; userId: string; workspaceId: string; ipAddress: string | null; userAgent: string | null }
  | { ok: false; error: string }
> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };

  if (
    !hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW) &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL)
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

async function loadOwnedRequest(id: string, workspaceId: string) {
  const rows = await db
    .select({ id: reviewRequest.id, workspaceId: reviewRequest.workspaceId })
    .from(reviewRequest)
    .where(and(eq(reviewRequest.id, id), eq(reviewRequest.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function approve(id: string, comment?: string): Promise<ActionResult> {
  const parsed = approveCommentSchema.safeParse({ id, comment });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const owned = await loadOwnedRequest(id, ctx.workspaceId);
    if (!owned) return { ok: false, error: "Not found" };

    const reviewedAt = new Date();
    await db
      .update(reviewRequest)
      .set({
        status: "approved",
        reviewerId: ctx.userId,
        reviewedAt,
        comment: comment ?? null,
      })
      .where(
        and(eq(reviewRequest.id, id), eq(reviewRequest.workspaceId, ctx.workspaceId)),
      );

    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "review.approve",
      resourceType: "review_request",
      resourceId: id,
      ipAddress: ctx.ipAddress as unknown as string | null,
      userAgent: ctx.userAgent,
      details: { comment: comment ?? null },
      success: true,
    });
  } catch (err) {
    console.error("review-queue.approve failed:", err);
    return { ok: false, error: "Failed to approve" };
  }

  revalidatePath("/admin/review-queue");
  return { ok: true };
}

export async function reject(id: string, reason: string): Promise<ActionResult> {
  const parsed = rejectReasonSchema.safeParse({ id, reason });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const owned = await loadOwnedRequest(id, ctx.workspaceId);
    if (!owned) return { ok: false, error: "Not found" };

    const reviewedAt = new Date();
    await db
      .update(reviewRequest)
      .set({
        status: "rejected",
        reviewerId: ctx.userId,
        reviewedAt,
        comment: reason,
      })
      .where(
        and(eq(reviewRequest.id, id), eq(reviewRequest.workspaceId, ctx.workspaceId)),
      );

    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "review.reject",
      resourceType: "review_request",
      resourceId: id,
      ipAddress: ctx.ipAddress as unknown as string | null,
      userAgent: ctx.userAgent,
      details: { reason },
      success: true,
    });
  } catch (err) {
    console.error("review-queue.reject failed:", err);
    return { ok: false, error: "Failed to reject" };
  }

  revalidatePath("/admin/review-queue");
  return { ok: true };
}

export async function defer(id: string): Promise<ActionResult> {
  const parsed = deferSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const owned = await loadOwnedRequest(id, ctx.workspaceId);
    if (!owned) return { ok: false, error: "Not found" };

    await db
      .update(reviewRequest)
      .set({
        status: "deferred",
        reviewerId: ctx.userId,
      })
      .where(
        and(eq(reviewRequest.id, id), eq(reviewRequest.workspaceId, ctx.workspaceId)),
      );

    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "review.defer",
      resourceType: "review_request",
      resourceId: id,
      ipAddress: ctx.ipAddress as unknown as string | null,
      userAgent: ctx.userAgent,
      details: {},
      success: true,
    });
  } catch (err) {
    console.error("review-queue.defer failed:", err);
    return { ok: false, error: "Failed to defer" };
  }

  revalidatePath("/admin/review-queue");
  return { ok: true };
}
