import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { askConversation, askMessage, db, sourceDocument, sourceRevision, wikiPageIndex } from "@jarvis/db";

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  citations: Array<Record<string, unknown>>;
  createdAt: Date;
};

export type OwnedConversation = {
  id: string;
  title: string | null;
  messages: ConversationMessage[];
};

export type CitationSource = {
  kind: "wiki" | "source";
  label: string;
  slug?: string;
  sourceRevisionId?: string;
  locator?: string;
  effectiveFrom?: string | null;
};

export type EnrichedCitation = CitationSource & {
  title?: string;
  wikiPath?: string | null;
  canonicalUrl?: string | null;
};

export async function listOwnedConversations(input: {
  workspaceId: string;
  userId: string;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const query = db
    .select({
      id: askConversation.id,
      title: askConversation.title,
      updatedAt: askConversation.updatedAt,
    })
    .from(askConversation)
    .where(and(eq(askConversation.workspaceId, input.workspaceId), eq(askConversation.userId, input.userId)))
    .orderBy(desc(askConversation.updatedAt));
  return input.limit === undefined ? query : query.limit(input.limit);
}

export async function loadOwnedConversation(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
}): Promise<OwnedConversation | null> {
  const [conversation] = await db
    .select({
      id: askConversation.id,
      title: askConversation.title,
    })
    .from(askConversation)
    .where(
      and(
        eq(askConversation.workspaceId, input.workspaceId),
        eq(askConversation.userId, input.userId),
        eq(askConversation.id, input.conversationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    return null;
  }

  const messages = await db
    .select({
      id: askMessage.id,
      role: askMessage.role,
      content: askMessage.content,
      citations: askMessage.citations,
      createdAt: askMessage.createdAt,
    })
    .from(askMessage)
    .where(
      and(
        eq(askMessage.workspaceId, input.workspaceId),
        eq(askMessage.userId, input.userId),
        eq(askMessage.conversationId, input.conversationId),
      ),
    )
    .orderBy(asc(askMessage.createdAt));

  return {
    ...conversation,
    messages: messages.map((message) => ({
      ...message,
      citations: Array.isArray(message.citations) ? message.citations : [],
    })),
  };
}

export async function createConversation(input: {
  workspaceId: string;
  userId: string;
  title: string;
}): Promise<{ id: string; title: string | null }> {
  const [conversation] = await db
    .insert(askConversation)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      status: "open",
    })
    .returning({ id: askConversation.id, title: askConversation.title });
  if (!conversation) {
    throw new Error("CONVERSATION_CREATE_FAILED");
  }
  return conversation;
}

export async function renameOwnedConversation(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  title: string;
}): Promise<boolean> {
  const title = input.title.trim();
  if (!title || title.length > 200) {
    return false;
  }

  const [conversation] = await db
    .update(askConversation)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(askConversation.workspaceId, input.workspaceId),
        eq(askConversation.userId, input.userId),
        eq(askConversation.id, input.conversationId),
      ),
    )
    .returning({ id: askConversation.id });

  return Boolean(conversation);
}

export async function deleteOwnedConversation(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
}): Promise<boolean> {
  const [conversation] = await db
    .delete(askConversation)
    .where(
      and(
        eq(askConversation.workspaceId, input.workspaceId),
        eq(askConversation.userId, input.userId),
        eq(askConversation.id, input.conversationId),
      ),
    )
    .returning({ id: askConversation.id });

  return Boolean(conversation);
}

export async function appendUserMessage(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  content: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(askMessage).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      citations: [],
      tokenCount: 0,
    });
    await tx
      .update(askConversation)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(askConversation.workspaceId, input.workspaceId),
          eq(askConversation.userId, input.userId),
          eq(askConversation.id, input.conversationId),
        ),
      );
  });
}

export async function appendAssistantMessage(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  content: string;
  citations: Array<Record<string, unknown>>;
  tokenCount: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(askMessage).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      citations: input.citations,
      tokenCount: input.tokenCount,
    });
    await tx
      .update(askConversation)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(askConversation.workspaceId, input.workspaceId),
          eq(askConversation.userId, input.userId),
          eq(askConversation.id, input.conversationId),
        ),
      );
  });
}

export async function enrichSourceCitation(
  workspaceId: string,
  source: CitationSource,
): Promise<EnrichedCitation> {
  let wikiPath: string | null = null;
  let title: string | undefined;
  let canonicalUrl: string | null = null;

  if (source.slug) {
    const [page] = await db
      .select({ title: wikiPageIndex.title, path: wikiPageIndex.path })
      .from(wikiPageIndex)
      .where(and(eq(wikiPageIndex.workspaceId, workspaceId), eq(wikiPageIndex.slug, source.slug)))
      .limit(1);
    if (page) {
      title = page.title;
      wikiPath = page.path;
    }
  }

  if (source.sourceRevisionId) {
    const [revision] = await db
      .select({
        title: sourceDocument.title,
        canonicalUrl: sourceDocument.canonicalUrl,
      })
      .from(sourceRevision)
      .innerJoin(sourceDocument, eq(sourceDocument.id, sourceRevision.sourceDocumentId))
      .where(and(eq(sourceRevision.workspaceId, workspaceId), eq(sourceRevision.id, source.sourceRevisionId)))
      .limit(1);
    if (revision) {
      title ??= revision.title;
      canonicalUrl = revision.canonicalUrl;
    }
  }

  return {
    ...source,
    title,
    wikiPath,
    canonicalUrl,
  };
}
