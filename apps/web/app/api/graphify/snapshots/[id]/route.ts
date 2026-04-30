// apps/web/app/api/graphify/snapshots/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { canAccessGraphSnapshotSensitivity } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and } from 'drizzle-orm';

// P1 #4 — graph snapshot 상세는 graph:read 또는 admin:all 필요.
// 추가로 sensitivity 검사 (RESTRICTED/SECRET_REF_ONLY 는 admin:all 만).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'graph:read');
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

  if (
    !canAccessGraphSnapshotSensitivity(session.permissions, snapshot.sensitivity)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ snapshot });
}
