// apps/web/app/api/ask/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRedis } from '@jarvis/db/redis';
import { askAI } from '@jarvis/ai/ask';
import type { SSEEvent } from '@jarvis/ai/types';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  snapshotId: z.string().uuid().optional(),
});

const RATE_LIMIT_MAX = 20;         // requests
const RATE_LIMIT_WINDOW = 3600;    // 1 hour in seconds

function rateLimitKey(userId: string): string {
  return `ratelimit:ask:${userId}`;
}

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  // 1. Auth + permission check
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  // 2. Parse + validate body
  let body: { question: string; snapshotId?: string };
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
  const redis = getRedis();
  const rlKey = rateLimitKey(session.userId);
  const current = await redis.incr(rlKey);
  if (current === 1) {
    // First request in this window — set TTL
    await redis.expire(rlKey, RATE_LIMIT_WINDOW);
  }
  if (current > RATE_LIMIT_MAX) {
    const ttl = await redis.ttl(rlKey);
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', retryAfter: ttl }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(ttl),
        },
      },
    );
  }

  // 4. Stream SSE response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = askAI({
          question: body.question,
          workspaceId: session.workspaceId,
          userId: session.userId,
          userRoles: session.roles ?? [],
          userPermissions: session.permissions ?? [],
          snapshotId: body.snapshotId,
        });

        for await (const event of generator) {
          controller.enqueue(encoder.encode(formatSSE(event)));
          if (event.type === 'done' || event.type === 'error') break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        const errorEvent: SSEEvent = { type: 'error', message };
        controller.enqueue(encoder.encode(formatSSE(errorEvent)));
      } finally {
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
