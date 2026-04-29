// apps/web/app/api/ask/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { askConversation, askMessage } from '@jarvis/db/schema';
import { askAI } from '@jarvis/ai/ask';
import type { SourceRef, SSEEvent } from '@jarvis/ai/types';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { evictOldConversations } from '@/app/(app)/ask/actions';

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  snapshotId: z.string().uuid().optional(),
  model: z.enum(['gpt-5.5', 'gpt-5.4-mini']).optional(),
  conversationId: z.string().uuid().optional(),
});

const RATE_LIMIT_MAX = 20;         // requests
const RATE_LIMIT_WINDOW = 3600;    // 1 hour in seconds

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Derives a cache scope key from the session's permissions.
 * Users with different clearance levels must NOT share cache entries — a
 * RESTRICTED-level response must never be served to a PUBLIC/INTERNAL caller.
 *
 * Knowledge level: aligns with W3-T5 buildWikiSensitivitySqlFilter rules.
 *   Only KNOWLEDGE_REVIEW and ADMIN_ALL may access RESTRICTED content.
 *   KNOWLEDGE_UPDATE alone (DEVELOPER role) no longer grants RESTRICTED access
 *   after W3-T5 — mapping it to 'restricted' here would cause cache poisoning
 *   (ADMIN/REVIEWER answers leaked to DEVELOPER callers).
 *
 * Graph dimension: graph:read gates graph-lane retrieval in ask.ts. A response that
 *   includes graph context must NOT be served to a non-graph-read caller from cache.
 */
function deriveSensitivityScope(workspaceId: string, permissions: string[]): string {
  let level: string;
  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    level = 'secret';
  } else if (permissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW)) {
    level = 'restricted';
  } else if (
    permissions.includes(PERMISSIONS.KNOWLEDGE_READ) ||
    permissions.includes(PERMISSIONS.KNOWLEDGE_UPDATE)
  ) {
    level = 'internal';
  } else {
    level = 'public';
  }

  const graphFlag = permissions.includes(PERMISSIONS.GRAPH_READ) || permissions.includes(PERMISSIONS.ADMIN_ALL)
    ? 'graph:1'
    : 'graph:0';

  return `workspace:${workspaceId}|level:${level}|${graphFlag}`;
}

/**
 * Generate a conversation title from the question (first 100 chars, truncated).
 */
function deriveTitle(question: string): string {
  const cleaned = question.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 100) return cleaned;
  return cleaned.slice(0, 97) + '...';
}

export async function POST(request: NextRequest) {
  // 1. Auth + permission check
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  // 2. Parse + validate body
  let body: {
    question: string;
    snapshotId?: string;
    model?: 'gpt-5.5' | 'gpt-5.4-mini';
    conversationId?: string;
  };
  try {
    const raw = await request.json();
    body = bodySchema.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Rate limiting (20 req / user / hour)
  const rl = checkRateLimit(`ask:${session.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', retryAfter: rl.retryAfterSec }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfterSec ?? RATE_LIMIT_WINDOW),
        },
      },
    );
  }

  // 4. Resolve or create conversation
  let activeConversationId = body.conversationId;
  let isNewConversation = false;
  let currentMessageCount = 0;

  if (activeConversationId) {
    // 기존 대화 — 소유권 검증
    const [existing] = await db
      .select({
        id: askConversation.id,
        messageCount: askConversation.messageCount,
      })
      .from(askConversation)
      .where(
        sql`${askConversation.id} = ${activeConversationId}
            AND ${askConversation.workspaceId} = ${session.workspaceId}
            AND ${askConversation.userId} = ${session.userId}`,
      )
      .limit(1);

    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }
    currentMessageCount = existing.messageCount;
  } else {
    // 새 대화 — eviction + INSERT
    isNewConversation = true;
    await evictOldConversations();

    const now = new Date();
    const rows = await db
      .insert(askConversation)
      .values({
        workspaceId: session.workspaceId,
        userId: session.userId,
        title: deriveTitle(body.question),
        snapshotId: body.snapshotId ?? null,
        messageCount: 0,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: askConversation.id });

    const created = rows[0];
    if (!created) {
      return new Response(
        JSON.stringify({ error: 'Failed to create conversation' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    activeConversationId = created.id;
  }

  // 5. Stream SSE response
  const encoder = new TextEncoder();
  const convId = activeConversationId;

  const stream = new ReadableStream({
    async start(controller) {
      // 새 대화면 conversation 이벤트 먼저 전송
      if (isNewConversation) {
        const convEvent: SSEEvent = { type: 'conversation', conversationId: convId };
        controller.enqueue(encoder.encode(formatSSE(convEvent)));
      }

      // 스트리밍 중 답변 수집용
      let fullAnswer = '';
      let collectedSources: SourceRef[] = [];
      let totalTokens = 0;
      let lane: string | null = null;
      let streamSuccess = false;
      // 에러로 끝났을 때도 대화 맥락을 잃지 않기 위해 error 메시지를 붙잡는다.
      // 재방문 시 UI 가 "질문 → ⚠️ 에러" 쌍으로 렌더링할 수 있어야 함.
      let errorMessage: string | null = null;

      try {
        const permissions = session.permissions ?? [];
        const generator = askAI({
          question: body.question,
          workspaceId: session.workspaceId,
          userId: session.userId,
          userRoles: session.roles ?? [],
          userPermissions: permissions,
          snapshotId: body.snapshotId,
          model: body.model,
          sensitivityScope: deriveSensitivityScope(session.workspaceId, permissions),
        });

        for await (const event of generator) {
          controller.enqueue(encoder.encode(formatSSE(event)));

          // 답변 수집
          if (event.type === 'text') {
            fullAnswer += event.content;
          } else if (event.type === 'sources') {
            collectedSources = event.sources;
          } else if (event.type === 'route') {
            lane = event.lane;
          } else if (event.type === 'done') {
            totalTokens = event.totalTokens;
            streamSuccess = true;
            break;
          } else if (event.type === 'error') {
            errorMessage = event.message;
            break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        errorMessage = message;
        const errorEvent: SSEEvent = { type: 'error', message };
        controller.enqueue(encoder.encode(formatSSE(errorEvent)));
      } finally {
        // 성공/에러 둘 다 저장 — conversation row 만 남고 메시지가 비는 상태를 방지.
        // 어느 쪽도 아닌 경우(예: 이벤트 0개 — 클라이언트 조기 disconnect)는 skip.
        const shouldPersist = Boolean(convId) && (streamSuccess || errorMessage !== null);
        if (shouldPersist && convId) {
          const baseOrder = currentMessageCount;
          const now = new Date();
          const assistantContent = streamSuccess
            ? fullAnswer
            : `⚠️ ${errorMessage}`;
          const assistantLane = streamSuccess ? lane : 'error';
          const assistantTokens = streamSuccess ? totalTokens : null;

          try {
            await db.transaction(async (tx) => {
              await tx.insert(askMessage).values([
                {
                  conversationId: convId,
                  role: 'user',
                  content: body.question,
                  sources: [],
                  lane: null,
                  totalTokens: null,
                  sortOrder: baseOrder,
                  createdAt: now,
                },
                {
                  conversationId: convId,
                  role: 'assistant',
                  content: assistantContent,
                  sources: collectedSources as unknown[],
                  lane: assistantLane,
                  totalTokens: assistantTokens,
                  sortOrder: baseOrder + 1,
                  createdAt: now,
                },
              ]);

              // conversation의 message_count 증분 + last_message_at 갱신
              await tx
                .update(askConversation)
                .set({
                  messageCount: sql`${askConversation.messageCount} + 2`,
                  lastMessageAt: now,
                  updatedAt: now,
                })
                .where(eq(askConversation.id, convId));
            });
          } catch (dbErr) {
            // 메시지 저장 실패는 스트림에 영향 주지 않음 — 로그만 남김
            console.error('[ask/route] Failed to persist messages:', dbErr);
          }
        }

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    },
  });
}
