// apps/web/app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PgSearchAdapter } from '@jarvis/search/pg-search';
import { PrecedentSearchAdapter } from '@jarvis/search/precedent-search';
import type { SearchResult } from '@jarvis/search/types';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { embedSearchQuery } from '@/lib/server/search-embedder';

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  // Phase-W5: resourceType routes to the appropriate Lane adapter.
  //   'knowledge' (default) → PgSearchAdapter (wiki pages, Lane A)
  //   'case'                → PrecedentSearchAdapter (precedent_case, Lane B)
  resourceType: z.enum(['knowledge', 'case']).optional(),
  pageType: z.string().optional(),
  sensitivity: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['relevance', 'newest', 'freshness', 'hybrid', 'date', 'popularity']).optional(),
  page: z.number().int().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const laneA = new PgSearchAdapter({ embedQuery: embedSearchQuery });
const laneB = new PrecedentSearchAdapter({ embedQuery: embedSearchQuery });

// Rate limit: 60 requests per minute per user
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 60;

function checkSearchRateLimit(userId: string): { allowed: boolean; retryAfterSec?: number } {
  const r = checkRateLimit(`search:${userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
  return { allowed: r.allowed, retryAfterSec: r.retryAfterSec };
}

export async function POST(request: NextRequest) {
  // 1. Auth check
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) {
    return auth.response;
  }

  const { session } = auth;

  // 2. Rate limit
  const rl = checkSearchRateLimit(session.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSec ?? RATE_LIMIT_WINDOW_SECONDS),
        },
      },
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
  // Normalize legacy aliases before passing to adapter
  const legacySortAliases: Record<string, import('@jarvis/search/types').SearchSortBy> = {
    date: 'newest',
    popularity: 'hybrid',
  };
  const rawSort = parsed.data.sortBy;
  const normalizedSort = rawSort
    ? legacySortAliases[rawSort] ?? (rawSort as import('@jarvis/search/types').SearchSortBy)
    : undefined;

  // Dispatch to the appropriate lane. Lanes live in separate vector spaces
  // and must never be UNIONed — see packages/search/README.md.
  const adapter = parsed.data.resourceType === 'case' ? laneB : laneA;

  try {
    const result: SearchResult = await adapter.search({
      q: parsed.data.q,
      workspaceId: session.workspaceId,
      userId: session.userId,
      userRoles: session.roles ?? [],
      userPermissions: session.permissions ?? [],
      pageType: parsed.data.pageType,
      sensitivity: parsed.data.sensitivity,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      sortBy: normalizedSort,
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
