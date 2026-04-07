import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, ilike, desc, count } from 'drizzle-orm';

const PAGE_TYPES = [
  'project', 'system', 'access', 'runbook', 'onboarding',
  'hr-policy', 'tool-guide', 'faq', 'decision', 'incident', 'analysis', 'glossary',
] as const;

const SENSITIVITIES = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY'] as const;

const createPageSchema = z.object({
  slug: z.string().min(1).max(500).regex(/^[a-z0-9-/]+$/, 'Slug must be lowercase alphanumeric with hyphens/slashes'),
  title: z.string().min(1).max(500),
  pageType: z.enum(PAGE_TYPES),
  sensitivity: z.enum(SENSITIVITIES).default('INTERNAL'),
  mdxContent: z.string().min(1),
  frontmatter: z.record(z.unknown()).optional().default({}),
  changeNote: z.string().max(500).optional(),
});

// GET /api/knowledge — paginated list with filters
export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const pageType = searchParams.get('pageType') ?? undefined;
  const publishStatus = searchParams.get('publishStatus') ?? undefined;
  const sensitivity = searchParams.get('sensitivity') ?? undefined;
  const q = searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const workspaceId = session.workspaceId;

  const conditions = [eq(knowledgePage.workspaceId, workspaceId)];
  if (pageType) conditions.push(eq(knowledgePage.pageType, pageType));
  if (publishStatus) conditions.push(eq(knowledgePage.publishStatus, publishStatus));
  if (sensitivity) conditions.push(eq(knowledgePage.sensitivity, sensitivity));
  if (q) conditions.push(ilike(knowledgePage.title, `%${q}%`));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(knowledgePage)
      .where(where)
      .orderBy(desc(knowledgePage.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(knowledgePage).where(where),
  ]);

  const total = Number(totalRows[0]?.total ?? 0);

  return NextResponse.json({
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /api/knowledge — create page + first version in a single transaction
export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_CREATE);
  if (auth.response) return auth.response;
  const { session } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createPageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const { slug, title, pageType, sensitivity, mdxContent, frontmatter, changeNote } = parsed.data;
  const workspaceId = session.workspaceId;
  const createdBy = session.userId;

  // Check slug uniqueness within workspace
  const existing = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.workspaceId, workspaceId), eq(knowledgePage.slug, slug)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: 'A page with this slug already exists in the workspace' }, { status: 409 });
  }

  const result = await db.transaction(async (tx) => {
    const insertedPages = await tx
      .insert(knowledgePage)
      .values({ workspaceId, slug, title, pageType, sensitivity, publishStatus: 'draft', createdBy })
      .returning();

    const page = insertedPages[0];
    if (!page) throw new Error('Failed to create page');

    const [version] = await tx
      .insert(knowledgePageVersion)
      .values({
        pageId: page.id,
        versionNumber: 1,
        title,
        mdxContent,
        frontmatter: frontmatter ?? {},
        changeNote: changeNote ?? 'Initial version',
        authorId: createdBy,
      })
      .returning();

    return { page, version };
  });

  return NextResponse.json(result, { status: 201 });
}
