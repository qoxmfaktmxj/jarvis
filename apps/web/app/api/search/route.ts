// apps/web/app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PgSearchAdapter } from '@jarvis/search/pg-search';
import type { SearchResult } from '@jarvis/search/types';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getRedis } from '@jarvis/db/redis';

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  pageType: z.string().optional(),
  sensitivity: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['relevance', 'newest', 'freshness', 'hybrid']).optional(),
  page: z.number().int().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const adapter = new PgSearchAdapter();

// Rate limit: 60 requests per minute per user
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 60;

async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `search:ratelimit:${userId}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= RATE_LIMIT_MAX;
  } catch {
    // If Redis is unavailable, allow the request
    return true;
  }
}

export async function POST(request: NextRequest) {
  // 1. Auth check
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) {
    return auth.response;
  }

  const { session } = auth;

  // 2. Rate limit
  const allowed = await checkRateLimit(session.userId);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  // 3. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } },
      { status: 400 },
    );
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      { status: 400 },
    );
  }

  // 4. Execute search
  try {
    const result: SearchResult = await adapter.search({
      q: parsed.data.q,
      workspaceId: session.workspaceId,
      userId: session.userId,
      userRoles: session.roles ?? [],
      pageType: parsed.data.pageType,
      sensitivity: parsed.data.sensitivity,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      sortBy: parsed.data.sortBy,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[search] Error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Search failed' } },
      { status: 500 },
    );
  }
}
