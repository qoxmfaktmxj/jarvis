// apps/web/app/api/graphify/snapshots/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;
  const { id } = await params;

  const [snapshot] = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.id, id),
        eq(graphSnapshot.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
