import { z } from "zod";
import { askAgentStream } from "@jarvis/ai";
import { PERMISSIONS } from "@jarvis/shared";
import { withApiPermission } from "@/lib/server/api-auth";
import { createAskAgentDeps } from "@/lib/server/ask-agent-deps";
import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
  enrichSourceCitation,
  loadOwnedConversation,
} from "@/lib/server/conversation-repository";

const askRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(2_000),
});

const rawAskEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool"),
    name: z.enum(["wiki_search", "wiki_read", "source_read", "wiki_follow_link"]),
  }),
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z.object({
    type: z.literal("source"),
    source: z.object({
      kind: z.enum(["wiki", "source"]),
      label: z.string().min(1),
      slug: z.string().min(1).optional(),
      sourceRevisionId: z.string().uuid().optional(),
      locator: z.string().min(1).optional(),
      effectiveFrom: z.string().nullable().optional(),
    }),
  }),
  z.object({ type: z.literal("abstain"), reason: z.string().min(1) }),
  z.object({ type: z.literal("done") }),
]);

const publicSourceSchema = z.object({
  kind: z.enum(["wiki", "source"]),
  label: z.string().min(1),
  title: z.string().optional(),
  wikiPath: z.string().nullable().optional(),
  locator: z.string().optional(),
  effectiveFrom: z.string().nullable().optional(),
});

export const POST = withApiPermission(PERMISSIONS.ASK_USE, async (request, session): Promise<Response> => {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, errorCode: "BAD_JSON" }, { status: 400 });
  }

  const parsedInput = askRequestSchema.safeParse(json);
  if (!parsedInput.success) {
    return Response.json({ ok: false, errorCode: "VALIDATION_FAILED" }, { status: 422 });
  }
  const input = parsedInput.data;

  const conversation = input.conversationId
    ? await loadOwnedConversation({
        workspaceId: session.workspaceId,
        userId: session.userId,
        conversationId: input.conversationId,
      })
    : await createConversation({
        workspaceId: session.workspaceId,
        userId: session.userId,
        title: input.question.slice(0, 80),
      });

  if (!conversation) {
    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  await appendUserMessage({
    workspaceId: session.workspaceId,
    userId: session.userId,
    conversationId: conversation.id,
    content: input.question,
  });

  const encoder = new TextEncoder();
  let answerText = "";
  const citations: Array<Record<string, unknown>> = [];
  let terminalPersisted = false;

  const toolContext = {
    workspaceId: session.workspaceId,
    userId: session.userId,
    accountType: session.accountType,
    permissions: new Set(session.permissions),
  } as const;
  const deps = createAskAgentDeps(toolContext);
  const publicErrorCode = (error: unknown) =>
    error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "ASK_STREAM_FAILED";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const raw of askAgentStream({ conversationId: conversation.id, question: input.question }, deps)) {
          if (request.signal.aborted) {
            break;
          }

          const event = rawAskEventSchema.parse(raw);
          if (event.type === "text") {
            answerText += event.text;
            controller.enqueue(encoder.encode(`event: text\ndata: ${JSON.stringify(event)}\n\n`));
            continue;
          }

          if (event.type === "source") {
            const enriched = await enrichSourceCitation(session.workspaceId, event.source);
            citations.push(enriched);
            controller.enqueue(
              encoder.encode(
                `event: source\ndata: ${JSON.stringify({
                  type: "source",
                  source: publicSourceSchema.parse({
                    kind: enriched.kind,
                    label: enriched.label,
                    title: enriched.title,
                    wikiPath: enriched.wikiPath ?? null,
                    locator: enriched.locator,
                    effectiveFrom: enriched.effectiveFrom ?? null,
                  }),
                })}\n\n`,
              ),
            );
            continue;
          }

          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          if (!terminalPersisted && (event.type === "done" || event.type === "abstain")) {
            await appendAssistantMessage({
              workspaceId: session.workspaceId,
              userId: session.userId,
              conversationId: conversation.id,
              content: event.type === "abstain" ? event.reason : answerText,
              citations,
              tokenCount: 0,
            });
            terminalPersisted = true;
          }
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ errorCode: publicErrorCode(error) })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": conversation.id,
    },
  });
});
