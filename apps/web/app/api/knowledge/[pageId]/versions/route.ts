import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { getPageVersions } from '@/lib/queries/knowledge';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

type Params = { params: Promise<{ pageId: string }> };

// GET /api/knowledge/[pageId]/versions — list all versions with author info
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId } = await params;

  const versions = await getPageVersions(
    pageId,
    session.workspaceId,
    session.permissions ?? [],
  );

  if (versions.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data: versions });
}
