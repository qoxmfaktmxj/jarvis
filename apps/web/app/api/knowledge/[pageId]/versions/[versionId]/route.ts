import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { getVersionContent } from '@/lib/queries/knowledge';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

type Params = { params: Promise<{ pageId: string; versionId: string }> };

// GET /api/knowledge/[pageId]/versions/[versionId] — full version content for diffs
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId, versionId } = await params;

  const version = await getVersionContent(
    versionId,
    session.workspaceId,
    session.permissions ?? [],
  );

  if (!version || version.pageId !== pageId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    versionNumber: version.versionNumber,
    mdxContent: version.mdxContent,
    changeNote: version.changeNote,
  });
}
