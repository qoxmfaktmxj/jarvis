"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, sql } from "@jarvis/db/client";
import { chatMessage, chatReaction, auditLog } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  sendMessageInputSchema,
  toggleReactionInputSchema,
  deleteMessageInputSchema
} from "@jarvis/shared/validation/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";
import { chatChannel } from "@jarvis/shared/chat/channel";
import { cookies, headers } from "next/headers";
import type { JarvisSession } from "@jarvis/auth/types";

// ---------------------------------------------------------------------------
// Pure validators (exported for tests)
// ---------------------------------------------------------------------------

export function validateSend(input: unknown) {
  return sendMessageInputSchema.parse(input);
}

export function validateToggle(input: unknown) {
  return toggleReactionInputSchema.parse(input);
}

export function validateDelete(input: unknown) {
  return deleteMessageInputSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Internal session helper (mirrors profile.ts pattern)
// ---------------------------------------------------------------------------

async function resolveSession(): Promise<JarvisSession> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null;

  if (!sessionId) throw new Error("unauthorized");

  const session = await getSession(sessionId);
  if (!session) throw new Error("unauthorized");

  return session;
}

// ---------------------------------------------------------------------------
// pg_notify helper — uses drizzle sql tag (matches drizzle-orm/node-postgres)
// ---------------------------------------------------------------------------

async function notify(channel: string, payload: object) {
  const json = JSON.stringify(payload);
  await db.execute(sql`SELECT pg_notify(${channel}, ${json})`);
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function sendMessage(input: unknown): Promise<{ id: string }> {
  const { body } = validateSend(input);
  const session = await resolveSession();
  const id = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(chatMessage).values({
      id,
      workspaceId: session.workspaceId,
      userId: session.userId,
      body
    });
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "CHAT_SEND",
      resourceType: "chat_message",
      resourceId: id,
      details: { bodyLength: body.length }
    });
  });

  await notify(chatChannel(session.workspaceId), { kind: "message", id });
  return { id };
}

export async function deleteMessage(input: unknown): Promise<{ ok: true }> {
  const { messageId } = validateDelete(input);
  const session = await resolveSession();

  const existing = await db
    .select({ userId: chatMessage.userId, workspaceId: chatMessage.workspaceId })
    .from(chatMessage)
    .where(and(eq(chatMessage.id, messageId), isNull(chatMessage.deletedAt)))
    .limit(1);

  if (existing.length === 0) throw new Error("message-not-found");
  if (existing[0]!.workspaceId !== session.workspaceId) throw new Error("forbidden");

  const isAuthor = existing[0]!.userId === session.userId;
  const isAdmin = hasPermission(session, PERMISSIONS.ADMIN_ALL);
  if (!isAuthor && !isAdmin) throw new Error("forbidden");

  await db.transaction(async (tx) => {
    await tx
      .update(chatMessage)
      .set({ deletedAt: new Date() })
      .where(eq(chatMessage.id, messageId));
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "CHAT_DELETE",
      resourceType: "chat_message",
      resourceId: messageId,
      details: {}
    });
  });

  await notify(chatChannel(session.workspaceId), {
    kind: "delete",
    id: messageId
  });
  return { ok: true };
}

export async function toggleReaction(
  input: unknown
): Promise<{ action: "added" | "removed" }> {
  const { messageId, emoji } = validateToggle(input);
  const session = await resolveSession();

  const msg = await db
    .select({ workspaceId: chatMessage.workspaceId })
    .from(chatMessage)
    .where(eq(chatMessage.id, messageId))
    .limit(1);

  if (msg.length === 0) throw new Error("message-not-found");
  if (msg[0]!.workspaceId !== session.workspaceId) throw new Error("forbidden");

  const existing = await db
    .select({ userId: chatReaction.userId })
    .from(chatReaction)
    .where(
      and(
        eq(chatReaction.messageId, messageId),
        eq(chatReaction.userId, session.userId),
        eq(chatReaction.emoji, emoji as ChatReactionEmoji)
      )
    )
    .limit(1);

  let action: "added" | "removed";

  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .delete(chatReaction)
        .where(
          and(
            eq(chatReaction.messageId, messageId),
            eq(chatReaction.userId, session.userId),
            eq(chatReaction.emoji, emoji as ChatReactionEmoji)
          )
        );
      action = "removed";
    } else {
      await tx.insert(chatReaction).values({
        messageId,
        userId: session.userId,
        emoji
      });
      action = "added";
    }
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: action! === "added" ? "CHAT_REACT_ADD" : "CHAT_REACT_REMOVE",
      resourceType: "chat_message",
      resourceId: messageId,
      details: { emoji }
    });
  });

  await notify(chatChannel(session.workspaceId), {
    kind: "reaction",
    id: messageId
  });

  return { action: action! };
}
