import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageOwner, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { requireApiSession } from '@/lib/server/api-auth';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, max } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string }> };

const updatePageSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  mdxContent: z.string().min(1),
  frontmatter: z.record(z.unknown()).optional(),
  changeNote: z.string().max(500).optional(),
  summary: z.string().optional(),
});

async function resolvePage(pageId: string, workspaceId: string) {
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);
  return page ?? null;
}

/**
 * Owner check: 페이지 작성자(`created_by`) 또는 `knowledge_page_owner` 테이블
 * 등록자만 본인 row로 인정. `created_by`가 nullable(legacy import 페이지)이라
 * owner 테이블도 함께 검사 (codex P2 finding 2026-05-16).
 */
async function isPageOwner(pageId: string, userId: string, createdBy: string | null): Promise<boolean> {
  if (createdBy === userId) return true;
  const rows = await db
    .select({ userId: knowledgePageOwner.userId })
    .from(knowledgePageOwner)
    .where(and(eq(knowledgePageOwner.pageId, pageId), eq(knowledgePageOwner.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// GET /api/knowledge/[pageId] — page + current (latest) version content
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId, session.permissions ?? []);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ page, version: page.currentVersion ?? null });
}

// PUT /api/knowledge/[pageId] — save a new version (increments version number)
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_ADMIN);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId } = await params;
  const page = await resolvePage(pageId, session.workspaceId);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // owner check: 본인 작성 또는 knowledge_page_owner 등록자만, ADMIN_ALL 보유자는 우회
  const isSuperAdmin = session.permissions.includes(PERMISSIONS.ADMIN_ALL);
  if (!isSuperAdmin && !(await isPageOwner(pageId, session.userId, page.createdBy))) {
    return NextResponse.json({ error: 'Forbidden: not owner' }, { status: 403 });
  }

  if (page.publishStatus === 'archived') {
    return NextResponse.json({ error: 'Archived pages cannot be edited' }, { status: 409 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const { mdxContent, frontmatter, changeNote, title, summary } = parsed.data;
  const pageTitle = title ?? page.title;

  const result = await db.transaction(async (tx) => {
    // Determine next version number
    const maxVerRows = await tx
      .select({ maxVer: max(knowledgePageVersion.versionNumber) })
      .from(knowledgePageVersion)
      .where(eq(knowledgePageVersion.pageId, pageId));

    const nextVersion = (maxVerRows[0]?.maxVer ?? 0) + 1;

    const [version] = await tx
      .insert(knowledgePageVersion)
      .values({
        pageId,
        versionNumber: nextVersion,
        title: pageTitle,
        mdxContent,
        frontmatter: frontmatter ?? {},
        changeNote: changeNote ?? `Version ${nextVersion}`,
        authorId: session.userId,
      })
      .returning();

    // Move back to draft when editing a published page
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (title) updateValues.title = title;
    if (summary !== undefined) updateValues.summary = summary;
    if (page.publishStatus === 'published') updateValues.publishStatus = 'draft';

    const [updated] = await tx
      .update(knowledgePage)
      .set(updateValues)
      .where(eq(knowledgePage.id, pageId))
      .returning();

    return { page: updated, version };
  });

  return NextResponse.json(result);
}

// DELETE /api/knowledge/[pageId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireApiSession(_req, PERMISSIONS.KNOWLEDGE_ADMIN);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { pageId } = await params;
  const page = await resolvePage(pageId, session.workspaceId);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // owner check: 본인 작성 또는 knowledge_page_owner 등록자만, ADMIN_ALL 보유자는 우회
  const isSuperAdmin = session.permissions.includes(PERMISSIONS.ADMIN_ALL);
  if (!isSuperAdmin && !(await isPageOwner(pageId, session.userId, page.createdBy))) {
    return NextResponse.json({ error: 'Forbidden: not owner' }, { status: 403 });
  }

  await db.delete(knowledgePage).where(eq(knowledgePage.id, pageId));

  return new NextResponse(null, { status: 204 });
}
