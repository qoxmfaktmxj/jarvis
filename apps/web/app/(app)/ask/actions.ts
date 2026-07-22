"use server";

import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@jarvis/shared";
import { deleteOwnedConversation, renameOwnedConversation } from "@/lib/server/conversation-repository";
import { requirePagePermission } from "@/lib/server/page-auth";

export type ConversationActionResult = { ok: true } | { ok: false; errorCode: "INVALID_TITLE" | "NOT_FOUND" };

export async function renameConversation(conversationId: string, rawTitle: string): Promise<ConversationActionResult> {
  const title = rawTitle.trim();
  if (!title || title.length > 200) {
    return { ok: false, errorCode: "INVALID_TITLE" };
  }

  const session = await requirePagePermission(PERMISSIONS.ASK_USE, "/ask");
  const renamed = await renameOwnedConversation({
    workspaceId: session.workspaceId,
    userId: session.userId,
    conversationId,
    title,
  });
  if (!renamed) {
    return { ok: false, errorCode: "NOT_FOUND" };
  }

  revalidatePath("/ask");
  return { ok: true };
}

export async function deleteConversation(conversationId: string): Promise<ConversationActionResult> {
  const session = await requirePagePermission(PERMISSIONS.ASK_USE, "/ask");
  const deleted = await deleteOwnedConversation({
    workspaceId: session.workspaceId,
    userId: session.userId,
    conversationId,
  });
  if (!deleted) {
    return { ok: false, errorCode: "NOT_FOUND" };
  }

  revalidatePath("/ask");
  return { ok: true };
}
