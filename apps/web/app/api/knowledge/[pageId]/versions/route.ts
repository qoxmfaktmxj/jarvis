import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { user } from '@jarvis/db/schema/user';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string }> };

// GET /api/knowledge/[pageId]/versions — list all versions with author info
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId } = await params;

  // Verify page belongs to workspace
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, session.workspaceId)))
    .limit(1);

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const versions = await db
    .select({
      id: knowledgePageVersion.id,
      versionNumber: knowledgePageVersion.versionNumber,
      changeNote: knowledgePageVersion.changeNote,
      createdAt: knowledgePageVersion.createdAt,
      authorId: knowledgePageVersion.authorId,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(knowledgePageVersion)
    .leftJoin(user, eq(knowledgePageVersion.authorId, user.id))
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber));

  return NextResponse.json({ data: versions });
}
