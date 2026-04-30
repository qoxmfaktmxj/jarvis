// apps/web/app/api/graphify/snapshots/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { canAccessGraphSnapshotSensitivity } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc } from 'drizzle-orm';

// P1 #4 — graph snapshot 목록은 graph:read 또는 admin:all 이 있어야 한다.
// 또한 RESTRICTED/SECRET_REF_ONLY sensitivity row 는 admin:all 만 볼 수 있도록
// 결과에서 사후 필터링 (graph file API 와 동일 수준 ACL).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'graph:read');
  if (auth.response) return auth.response;
  const { session } = auth;

  const rows = await db
    .select()
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, session.workspaceId))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(50);

  const snapshots = rows.filter((row) =>
    canAccessGraphSnapshotSensitivity(session.permissions, row.sensitivity),
  );

  return NextResponse.json({ snapshots });
}
