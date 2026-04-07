// apps/web/app/api/search/suggest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PgSearchAdapter } from '@jarvis/search/pg-search';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const adapter = new PgSearchAdapter();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';

  if (!q || q.trim().length < 2) {
    return NextResponse.json<string[]>([]);
  }

  // Require session to scope suggestions to user's workspace
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) {
    return NextResponse.json<string[]>([]);
  }

  try {
    const suggestions = await adapter.suggest(q.trim(), auth.session.workspaceId);
    return NextResponse.json<string[]>(suggestions, {
      headers: {
        // Cache suggest responses briefly to reduce DB load
        'Cache-Control': 'private, max-age=10',
      },
    });
  } catch {
    return NextResponse.json<string[]>([]);
  }
}
