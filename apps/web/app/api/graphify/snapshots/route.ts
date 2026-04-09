// apps/web/app/api/graphify/snapshots/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;

  const snapshots = await db
    .select()
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, session.workspaceId))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(50);

  return NextResponse.json({ snapshots });
}
