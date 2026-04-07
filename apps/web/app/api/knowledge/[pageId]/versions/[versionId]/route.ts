import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string; versionId: string }> };

// GET /api/knowledge/[pageId]/versions/[versionId] — full version content for diffs
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId, versionId } = await params;

  // Verify page belongs to workspace
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, session.workspaceId)))
    .limit(1);

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(and(eq(knowledgePageVersion.id, versionId), eq(knowledgePageVersion.pageId, pageId)))
    .limit(1);

  if (!version) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    versionNumber: version.versionNumber,
    mdxContent: version.mdxContent,
    changeNote: version.changeNote,
  });
}
