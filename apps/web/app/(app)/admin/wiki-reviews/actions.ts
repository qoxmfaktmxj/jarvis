"use server";

import { requireActionPermission } from "@/lib/server/action-auth";
import { listWikiReviews, resolveWikiReview } from "@/lib/server/repositories/wiki-reviews";
import { PERMISSIONS } from "@jarvis/shared";

export async function listWikiReviewsAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.REVIEW_MANAGE);
  return listWikiReviews({ workspaceId: session.workspaceId }, raw);
}

export async function resolveWikiReviewAction(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.REVIEW_MANAGE);
  return resolveWikiReview({ workspaceId: session.workspaceId, actorUserId: session.userId }, raw);
}
