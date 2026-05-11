// apps/web/app/api/graphify/snapshots/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc } from 'drizzle-orm';

// Step 2D (2026-05-11): graph_snapshot.sensitivity 컬럼 제거 (D2=B 정책 graph 적용).
// 권한: graph:read 또는 admin:all (요구사항은 그대로). row-level sensitivity 필터링
// 은 제거 — workspaceId 격리 + RBAC 만 사용.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'graph:read');
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
