# Jarvis Plan 05: Knowledge Platform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Knowledge Platform — MDX-based wiki with versioning, Draft/Review/Publish workflow, knowledge hubs (onboarding, HR, FAQ, glossary), and review interface.

**Architecture:** MDX content stored as text in knowledge_page_version.mdx_content. Rendered server-side using next-mdx-remote/rsc. PageEditor is a client component (textarea with live preview toggle). Version diff uses plain text line diff. Review workflow enforces state machine transitions server-side.

**Tech Stack:** Next.js 15, next-mdx-remote 5, Drizzle ORM, shadcn/ui (Tabs, Badge, Dialog, Accordion), diff library for version comparison, Vitest, Playwright

**Prerequisites:** Plan 01 Foundation complete.

---

## File Map

```
apps/web/app/(app)/knowledge/
├── page.tsx                                      CREATE
├── new/page.tsx                                  CREATE
├── onboarding/page.tsx                           CREATE
├── hr/page.tsx                                   CREATE
├── tools/page.tsx                                CREATE
├── faq/page.tsx                                  CREATE
├── glossary/page.tsx                             CREATE
└── [pageId]/
    ├── page.tsx                                  CREATE
    ├── edit/page.tsx                             CREATE
    ├── history/page.tsx                          CREATE
    └── review/page.tsx                           CREATE
apps/web/app/api/knowledge/
├── route.ts                                      CREATE
└── [pageId]/
    ├── route.ts                                  CREATE
    ├── versions/route.ts                         CREATE
    └── review/route.ts                           CREATE
apps/web/components/knowledge/
├── PageEditor.tsx                                CREATE
├── PageViewer.tsx                                CREATE
├── VersionHistory.tsx                            CREATE
├── VersionDiff.tsx                               CREATE
├── ReviewPanel.tsx                               CREATE
└── PageMetaSidebar.tsx                           CREATE
apps/web/lib/queries/knowledge.ts                 CREATE
apps/web/styles/mdx.css                           CREATE
```

---

## Task 1: Knowledge API — list + create

**Files:**
- Create: `apps/web/app/api/knowledge/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/knowledge/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, ilike, desc, count, sql } from 'drizzle-orm';

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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(knowledgePage)
      .where(where)
      .orderBy(desc(knowledgePage.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(knowledgePage).where(where),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
}

// POST /api/knowledge — create page + first version in a single transaction
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_CREATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
    const [page] = await tx
      .insert(knowledgePage)
      .values({ workspaceId, slug, title, pageType, sensitivity, publishStatus: 'draft', createdBy })
      .returning();

    const [version] = await tx
      .insert(knowledgePageVersion)
      .values({
        pageId: page.id,
        workspaceId,
        versionNumber: 1,
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
```

---

## Task 2: Knowledge API — detail + update + review

**Files:**
- Create: `apps/web/app/api/knowledge/[pageId]/route.ts`
- Create: `apps/web/app/api/knowledge/[pageId]/versions/route.ts`
- Create: `apps/web/app/api/knowledge/[pageId]/review/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/knowledge/[pageId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc, max } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string }> };

const updatePageSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  sensitivity: z.enum(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY']).optional(),
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

// GET /api/knowledge/[pageId] — page + current (latest) version content
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { pageId } = await params;
  const page = await resolvePage(pageId, session.workspaceId);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch latest version
  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  return NextResponse.json({ page, version: version ?? null });
}

// PUT /api/knowledge/[pageId] — save a new version (increments version number)
export async function PUT(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { pageId } = await params;
  const page = await resolvePage(pageId, session.workspaceId);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const { mdxContent, frontmatter, changeNote, title, sensitivity, summary } = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Determine next version number
    const [{ maxVer }] = await tx
      .select({ maxVer: max(knowledgePageVersion.versionNumber) })
      .from(knowledgePageVersion)
      .where(eq(knowledgePageVersion.pageId, pageId));

    const nextVersion = (maxVer ?? 0) + 1;

    const [version] = await tx
      .insert(knowledgePageVersion)
      .values({
        pageId,
        workspaceId: session.workspaceId,
        versionNumber: nextVersion,
        mdxContent,
        frontmatter: frontmatter ?? {},
        changeNote: changeNote ?? `Version ${nextVersion}`,
        authorId: session.userId,
      })
      .returning();

    // Move back to draft when editing a published page
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (title) updateValues.title = title;
    if (sensitivity) updateValues.sensitivity = sensitivity;
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_DELETE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { pageId } = await params;
  const page = await resolvePage(pageId, session.workspaceId);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(knowledgePage).where(eq(knowledgePage.id, pageId));

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Create `apps/web/app/api/knowledge/[pageId]/versions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { user } from '@jarvis/db/schema/user';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string }> };

// GET /api/knowledge/[pageId]/versions — list all versions with author info
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
```

- [ ] **Step 3: Create `apps/web/app/api/knowledge/[pageId]/review/route.ts`**

State machine rules:
- `submit`: page must be in `draft` → moves to `review`, creates `review_request` with status `pending`
- `approve`: page must be in `review`, caller must have `KNOWLEDGE_REVIEW` → moves to `published`
- `reject`: page must be in `review`, caller must have `KNOWLEDGE_REVIEW` → moves back to `draft`

Review is **always required** for `access`, `hr-policy`, `incident` page types, and for any page with `RESTRICTED` or `SECRET_REF_ONLY` sensitivity.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { reviewRequest } from '@jarvis/db/schema/review';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc } from 'drizzle-orm';

type Params = { params: Promise<{ pageId: string }> };

const REVIEW_REQUIRED_TYPES = new Set(['access', 'hr-policy', 'incident']);
const REVIEW_REQUIRED_SENSITIVITIES = new Set(['RESTRICTED', 'SECRET_REF_ONLY']);

const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), reviewerId: z.string().uuid().optional() }),
  z.object({ action: z.literal('approve'), comment: z.string().optional() }),
  z.object({ action: z.literal('reject'), comment: z.string().min(1, 'Comment is required when rejecting') }),
]);

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await params;

  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, session.workspaceId)))
    .limit(1);

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = reviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const data = parsed.data;

  // ---- submit ----
  if (data.action === 'submit') {
    if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (page.publishStatus !== 'draft') {
      return NextResponse.json(
        { error: `Cannot submit for review: page is currently in '${page.publishStatus}' status` },
        { status: 409 },
      );
    }

    const needsReview =
      REVIEW_REQUIRED_TYPES.has(page.pageType) ||
      REVIEW_REQUIRED_SENSITIVITIES.has(page.sensitivity ?? '');

    const result = await db.transaction(async (tx) => {
      await tx.update(knowledgePage).set({ publishStatus: 'review', updatedAt: new Date() }).where(eq(knowledgePage.id, pageId));

      if (needsReview) {
        // Cancel any existing pending requests first
        await tx
          .update(reviewRequest)
          .set({ status: 'withdrawn' })
          .where(and(eq(reviewRequest.pageId, pageId), eq(reviewRequest.status, 'pending')));

        const [request_] = await tx
          .insert(reviewRequest)
          .values({
            pageId,
            workspaceId: session.workspaceId,
            requesterId: session.userId,
            reviewerId: data.reviewerId ?? null,
            status: 'pending',
          })
          .returning();

        return { publishStatus: 'review', reviewRequest: request_, requiresReview: true };
      }

      // Types that don't require review auto-publish
      await tx.update(knowledgePage).set({ publishStatus: 'published', updatedAt: new Date() }).where(eq(knowledgePage.id, pageId));
      return { publishStatus: 'published', reviewRequest: null, requiresReview: false };
    });

    return NextResponse.json(result);
  }

  // ---- approve / reject ----
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW)) {
    return NextResponse.json({ error: 'Forbidden: KNOWLEDGE_REVIEW permission required' }, { status: 403 });
  }

  if (page.publishStatus !== 'review') {
    return NextResponse.json(
      { error: `Cannot ${data.action}: page is not in 'review' status` },
      { status: 409 },
    );
  }

  // Find the active review request
  const [activeRequest] = await db
    .select()
    .from(reviewRequest)
    .where(and(eq(reviewRequest.pageId, pageId), eq(reviewRequest.status, 'pending')))
    .orderBy(desc(reviewRequest.createdAt))
    .limit(1);

  const now = new Date();

  if (data.action === 'approve') {
    await db.transaction(async (tx) => {
      await tx.update(knowledgePage).set({ publishStatus: 'published', updatedAt: now }).where(eq(knowledgePage.id, pageId));

      if (activeRequest) {
        await tx
          .update(reviewRequest)
          .set({ status: 'approved', reviewerId: session.userId, comment: data.comment ?? null, reviewedAt: now })
          .where(eq(reviewRequest.id, activeRequest.id));
      }
    });

    return NextResponse.json({ publishStatus: 'published' });
  }

  // reject
  await db.transaction(async (tx) => {
    await tx.update(knowledgePage).set({ publishStatus: 'draft', updatedAt: now }).where(eq(knowledgePage.id, pageId));

    if (activeRequest) {
      await tx
        .update(reviewRequest)
        .set({ status: 'rejected', reviewerId: session.userId, comment: data.comment, reviewedAt: now })
        .where(eq(reviewRequest.id, activeRequest.id));
    }
  });

  return NextResponse.json({ publishStatus: 'draft' });
}
```

---

## Task 3: Knowledge queries

**Files:**
- Create: `apps/web/lib/queries/knowledge.ts`

- [ ] **Step 1: Create `apps/web/lib/queries/knowledge.ts`**

```typescript
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { user } from '@jarvis/db/schema/user';
import { and, desc, eq, ilike, count } from 'drizzle-orm';
import type { PaginatedResponse } from '@jarvis/shared/types/api';

export type KnowledgePage = typeof knowledgePage.$inferSelect;
export type KnowledgePageVersion = typeof knowledgePageVersion.$inferSelect;

export type KnowledgePageWithVersion = KnowledgePage & {
  currentVersion: KnowledgePageVersion | null;
};

export type PageVersion = Pick<
  KnowledgePageVersion,
  'id' | 'versionNumber' | 'changeNote' | 'createdAt' | 'authorId'
> & {
  authorName: string | null;
  authorEmail: string | null;
};

export interface KnowledgeFilters {
  pageType?: string;
  publishStatus?: string;
  sensitivity?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export async function getKnowledgePages(
  workspaceId: string,
  filters: KnowledgeFilters = {},
): Promise<PaginatedResponse<KnowledgePage>> {
  const { pageType, publishStatus, sensitivity, q, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(knowledgePage.workspaceId, workspaceId)];
  if (pageType) conditions.push(eq(knowledgePage.pageType, pageType));
  if (publishStatus) conditions.push(eq(knowledgePage.publishStatus, publishStatus));
  if (sensitivity) conditions.push(eq(knowledgePage.sensitivity, sensitivity));
  if (q) conditions.push(ilike(knowledgePage.title, `%${q}%`));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(knowledgePage).where(where).orderBy(desc(knowledgePage.updatedAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(knowledgePage).where(where),
  ]);

  return {
    data: rows,
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}

export async function getKnowledgePage(
  pageId: string,
  workspaceId: string,
): Promise<KnowledgePageWithVersion | null> {
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  if (!page) return null;

  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  return { ...page, currentVersion: version ?? null };
}

export async function getPageVersions(pageId: string, workspaceId: string): Promise<PageVersion[]> {
  // Verify page belongs to workspace first
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  if (!page) return [];

  return db
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
}

export async function getPagesByType(
  workspaceId: string,
  pageType: string,
  limit = 10,
): Promise<KnowledgePage[]> {
  return db
    .select()
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        eq(knowledgePage.pageType, pageType),
        eq(knowledgePage.publishStatus, 'published'),
      ),
    )
    .orderBy(desc(knowledgePage.updatedAt))
    .limit(limit);
}

export async function getVersionContent(
  versionId: string,
  workspaceId: string,
): Promise<KnowledgePageVersion | null> {
  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.id, versionId))
    .limit(1);

  if (!version) return null;

  // Ensure the parent page belongs to this workspace
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, version.pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  return page ? version : null;
}
```

---

## Task 4: MDX styles + PageViewer component

**Files:**
- Create: `apps/web/styles/mdx.css`
- Create: `apps/web/components/knowledge/PageViewer.tsx`

- [ ] **Step 1: Add `next-mdx-remote` and `diff` to `apps/web/package.json`**

Open `apps/web/package.json` and add to `dependencies`:

```json
"next-mdx-remote": "^5.0.0",
"diff": "^7.0.0"
```

And to `devDependencies`:
```json
"@types/diff": "^7.0.0"
```

Then run:
```bash
pnpm install
```

- [ ] **Step 2: Create `apps/web/styles/mdx.css`**

```css
/* MDX prose styles */
.mdx-content {
  font-size: 1rem;
  line-height: 1.75;
  color: hsl(var(--foreground));
}

.mdx-content h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-top: 2rem;
  margin-bottom: 1rem;
  line-height: 1.25;
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.5rem;
}

.mdx-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-top: 1.75rem;
  margin-bottom: 0.75rem;
  line-height: 1.3;
}

.mdx-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.mdx-content h4,
.mdx-content h5,
.mdx-content h6 {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.mdx-content p {
  margin-bottom: 1rem;
}

.mdx-content ul,
.mdx-content ol {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.mdx-content ul {
  list-style-type: disc;
}

.mdx-content ol {
  list-style-type: decimal;
}

.mdx-content li {
  margin-bottom: 0.25rem;
}

.mdx-content li > ul,
.mdx-content li > ol {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

.mdx-content a {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.mdx-content a:hover {
  opacity: 0.8;
}

.mdx-content strong {
  font-weight: 700;
}

.mdx-content em {
  font-style: italic;
}

.mdx-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  background-color: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
}

.mdx-content pre {
  background-color: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}

.mdx-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 0.875rem;
  color: hsl(var(--foreground));
}

.mdx-content blockquote {
  border-left: 4px solid hsl(var(--primary));
  padding-left: 1rem;
  margin-left: 0;
  margin-bottom: 1rem;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.mdx-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.mdx-content thead {
  background-color: hsl(var(--muted));
}

.mdx-content th {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid hsl(var(--border));
}

.mdx-content td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}

.mdx-content tbody tr:hover {
  background-color: hsl(var(--muted) / 0.5);
}

.mdx-content hr {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 2rem 0;
}

.mdx-content img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.mdx-content .callout {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}
```

- [ ] **Step 3: Create `apps/web/components/knowledge/PageViewer.tsx`**

```tsx
import '../../../styles/mdx.css';
import { MDXRemote } from 'next-mdx-remote/rsc';

interface PageViewerProps {
  mdxContent: string;
  className?: string;
}

// Custom MDX components — extend as needed
const components = {
  // Wrap tables for horizontal scroll on small screens
  table: (props: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  // Open external links in a new tab
  a: ({ href, ...props }: React.ComponentPropsWithoutRef<'a'>) => {
    const isExternal = href?.startsWith('http');
    return (
      <a
        href={href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      />
    );
  },
};

export async function PageViewer({ mdxContent, className }: PageViewerProps) {
  // Validate that content is non-empty before attempting to render
  if (!mdxContent?.trim()) {
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <p className="text-muted-foreground italic">No content available.</p>
      </div>
    );
  }

  try {
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <MDXRemote source={mdxContent} components={components} />
      </div>
    );
  } catch (err) {
    // Fallback: render raw content when MDX compilation fails
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-4 text-sm text-destructive">
          MDX compilation error — showing raw content.
        </div>
        <pre className="whitespace-pre-wrap text-sm">{mdxContent}</pre>
      </div>
    );
  }
}
```

---

## Task 5: PageEditor component

**Files:**
- Create: `apps/web/components/knowledge/PageEditor.tsx`

- [ ] **Step 1: Create `apps/web/components/knowledge/PageEditor.tsx`**

```tsx
'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bold, Italic, Code2, Link2, Image, Eye, Edit3 } from 'lucide-react';

const PAGE_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'system', label: 'System' },
  { value: 'access', label: 'Access' },
  { value: 'runbook', label: 'Runbook' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'hr-policy', label: 'HR Policy' },
  { value: 'tool-guide', label: 'Tool Guide' },
  { value: 'faq', label: 'FAQ' },
  { value: 'decision', label: 'Decision' },
  { value: 'incident', label: 'Incident' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'glossary', label: 'Glossary' },
] as const;

const SENSITIVITIES = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'SECRET_REF_ONLY', label: 'Secret (ref only)' },
] as const;

export interface PageEditorProps {
  mode: 'create' | 'edit';
  pageId?: string;
  initialValues?: {
    slug?: string;
    title?: string;
    pageType?: string;
    sensitivity?: string;
    mdxContent?: string;
    tags?: string[];
    summary?: string;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  before: string,
  after = '',
  placeholder = '',
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  const newValue =
    textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  return newValue;
}

export function PageEditor({ mode, pageId, initialValues = {} }: PageEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialValues.title ?? '');
  const [slug, setSlug] = useState(initialValues.slug ?? '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialValues.slug);
  const [pageType, setPageType] = useState(initialValues.pageType ?? 'project');
  const [sensitivity, setSensitivity] = useState(initialValues.sensitivity ?? 'INTERNAL');
  const [mdxContent, setMdxContent] = useState(initialValues.mdxContent ?? '');
  const [tagsInput, setTagsInput] = useState((initialValues.tags ?? []).join(', '));
  const [summary, setSummary] = useState(initialValues.summary ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-generate slug from title in create mode
  const handleTitleChange = useCallback(
    (val: string) => {
      setTitle(val);
      if (mode === 'create' && !slugManuallyEdited) {
        setSlug(slugify(val));
      }
    },
    [mode, slugManuallyEdited],
  );

  const handleSlugChange = useCallback((val: string) => {
    setSlug(val);
    setSlugManuallyEdited(true);
  }, []);

  // Toolbar helpers
  const applyFormat = useCallback(
    (before: string, after = '', placeholder = '') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const newValue = insertAtCursor(ta, before, after, placeholder);
      setMdxContent(newValue);
      // Restore focus after state update
      requestAnimationFrame(() => ta.focus());
    },
    [],
  );

  // Load preview via server action / API
  const handleTabChange = useCallback(
    async (tab: string) => {
      setActiveTab(tab as 'write' | 'preview');
      if (tab === 'preview' && mdxContent) {
        try {
          const res = await fetch('/api/knowledge/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mdxContent }),
          });
          if (res.ok) {
            const { html } = await res.json() as { html: string };
            setPreviewHtml(html);
          }
        } catch {
          setPreviewHtml('<p class="text-muted-foreground italic">Preview unavailable.</p>');
        }
      }
    },
    [mdxContent],
  );

  const handleSave = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const url = mode === 'create' ? '/api/knowledge' : `/api/knowledge/${pageId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        const body =
          mode === 'create'
            ? { slug, title, pageType, sensitivity, mdxContent, changeNote: changeNote || 'Initial version', frontmatter: { tags, summary } }
            : { title, sensitivity, mdxContent, changeNote: changeNote || 'Updated content', frontmatter: { tags, summary }, summary };

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json() as { error?: string };
          setError(data.error ?? 'Save failed');
          return;
        }

        const data = await res.json() as { page?: { id: string } };
        const targetId = mode === 'create' ? data.page?.id : pageId;
        if (targetId) {
          router.push(`/knowledge/${targetId}`);
        } else {
          router.push('/knowledge');
        }
      } catch {
        setError('Network error — please try again');
      }
    });
  }, [mode, pageId, slug, title, pageType, sensitivity, mdxContent, tagsInput, summary, changeNote, router]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{mode === 'create' ? 'New Knowledge Page' : 'Edit Page'}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'create' ? 'Create Page' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Metadata fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Page title"
          />
        </div>

        {mode === 'create' && (
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="page-slug"
              className="font-mono text-sm"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Page Type</Label>
          <Select value={pageType} onValueChange={setPageType} disabled={mode === 'edit'}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Sensitivity</Label>
          <Select value={sensitivity} onValueChange={setSensitivity}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENSITIVITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief description of this page"
            rows={2}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="security, onboarding, aws"
          />
          <div className="flex flex-wrap gap-1 mt-1">
            {tagsInput
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
          </div>
        </div>

        {mode === 'edit' && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="changeNote">Change Note</Label>
            <Input
              id="changeNote"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Describe what changed in this version"
            />
          </div>
        )}
      </div>

      {/* MDX editor */}
      <div className="space-y-2">
        <Label>Content (MDX)</Label>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between mb-2">
            {/* Formatting toolbar */}
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('**', '**', 'bold text')}
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('_', '_', 'italic text')}
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('`', '`', 'code')}
                title="Inline code"
              >
                <Code2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('\n```\n', '\n```\n', 'code block')}
                title="Code block"
              >
                <Code2 className="h-4 w-4 opacity-60" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('[', '](url)', 'link text')}
                title="Link"
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('![alt](', ')', 'image-url')}
                title="Image"
              >
                <Image className="h-4 w-4" />
              </Button>
            </div>

            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                <Edit3 className="h-3 w-3 mr-1" /> Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="h-3 w-3 mr-1" /> Preview
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="write" className="mt-0">
            <Textarea
              ref={textareaRef}
              value={mdxContent}
              onChange={(e) => setMdxContent(e.target.value)}
              placeholder="Write your content in MDX..."
              className="min-h-[500px] font-mono text-sm resize-y"
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <div className="min-h-[500px] rounded-md border p-4 bg-background">
              {previewHtml ? (
                <div
                  className="mdx-content"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-muted-foreground italic text-sm">
                  Loading preview…
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

---

## Task 6: Version history + diff

**Files:**
- Create: `apps/web/components/knowledge/VersionHistory.tsx`
- Create: `apps/web/components/knowledge/VersionDiff.tsx`
- Create: `apps/web/app/(app)/knowledge/[pageId]/history/page.tsx`

- [ ] **Step 1: Create `apps/web/components/knowledge/VersionHistory.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { GitCompare } from 'lucide-react';
import { VersionDiff } from './VersionDiff';
import type { PageVersion } from '@/lib/queries/knowledge';

interface VersionHistoryProps {
  versions: PageVersion[];
  pageId: string;
}

export function VersionHistory({ versions, pageId }: VersionHistoryProps) {
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const handleCompare = (versionId: string) => {
    if (!compareA) {
      setCompareA(versionId);
    } else if (!compareB && versionId !== compareA) {
      setCompareB(versionId);
      setDiffOpen(true);
    } else {
      // Reset and start again
      setCompareA(versionId);
      setCompareB(null);
      setDiffOpen(false);
    }
  };

  const handleCloseDiff = () => {
    setDiffOpen(false);
    setCompareA(null);
    setCompareB(null);
  };

  const selectedCount = [compareA, compareB].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <GitCompare className="h-4 w-4" />
          {selectedCount === 1
            ? 'Select another version to compare'
            : 'Comparing two versions…'}
          <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={handleCloseDiff}>
            Clear
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Version</TableHead>
            <TableHead>Change Note</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v, idx) => (
            <TableRow key={v.id}>
              <TableCell>
                <Badge variant={idx === 0 ? 'default' : 'secondary'}>v{v.versionNumber}</Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate">{v.changeNote ?? '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {v.authorName ?? v.authorEmail ?? 'Unknown'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {v.createdAt
                  ? formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })
                  : '—'}
              </TableCell>
              <TableCell>
                <Button
                  variant={compareA === v.id || compareB === v.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCompare(v.id)}
                >
                  {compareA === v.id || compareB === v.id ? 'Selected' : 'Compare'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {diffOpen && compareA && compareB && (
        <VersionDiff
          pageId={pageId}
          versionIdA={compareA}
          versionIdB={compareB}
          onClose={handleCloseDiff}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/knowledge/VersionDiff.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { diffLines, type Change } from 'diff';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X } from 'lucide-react';

interface VersionDiffProps {
  pageId: string;
  versionIdA: string;
  versionIdB: string;
  onClose: () => void;
}

interface VersionContent {
  versionNumber: number;
  mdxContent: string;
  changeNote?: string | null;
}

async function fetchVersionContent(pageId: string, versionId: string): Promise<VersionContent> {
  const res = await fetch(`/api/knowledge/${pageId}/versions/${versionId}`);
  if (!res.ok) throw new Error('Failed to load version');
  return res.json() as Promise<VersionContent>;
}

function DiffLine({ change }: { change: Change }) {
  if (change.added) {
    return (
      <div className="bg-green-50 dark:bg-green-950/30 border-l-2 border-green-500 px-3 py-0.5 font-mono text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
        + {change.value}
      </div>
    );
  }
  if (change.removed) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 px-3 py-0.5 font-mono text-xs text-red-800 dark:text-red-200 whitespace-pre-wrap line-through opacity-80">
        - {change.value}
      </div>
    );
  }
  return (
    <div className="px-3 py-0.5 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
      &nbsp;&nbsp;{change.value}
    </div>
  );
}

export function VersionDiff({ pageId, versionIdA, versionIdB, onClose }: VersionDiffProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [labelA, setLabelA] = useState('');
  const [labelB, setLabelB] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchVersionContent(pageId, versionIdA),
      fetchVersionContent(pageId, versionIdB),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setLabelA(`v${a.versionNumber}${a.changeNote ? ` — ${a.changeNote}` : ''}`);
        setLabelB(`v${b.versionNumber}${b.changeNote ? ` — ${b.changeNote}` : ''}`);
        setChanges(diffLines(a.mdxContent, b.mdxContent));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as Error).message ?? 'Failed to load diff');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageId, versionIdA, versionIdB]);

  const added = changes.filter((c) => c.added).reduce((n, c) => n + (c.count ?? 0), 0);
  const removed = changes.filter((c) => c.removed).reduce((n, c) => n + (c.count ?? 0), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-none">
          <div className="flex items-center justify-between">
            <DialogTitle>Version Comparison</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
          {!loading && !error && (
            <div className="flex gap-4 text-sm text-muted-foreground mt-1">
              <span className="font-mono">{labelA}</span>
              <span>→</span>
              <span className="font-mono">{labelB}</span>
              <span className="ml-auto text-green-600">+{added} lines</span>
              <span className="text-red-600">-{removed} lines</span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto rounded-md border bg-background">
          {loading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-destructive">{error}</div>
          )}
          {!loading && !error && (
            <div className="divide-y divide-border/50">
              {changes.map((change, i) => (
                <DiffLine key={i} change={change} />
              ))}
              {changes.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground italic">No differences found.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(app)/knowledge/[pageId]/history/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage, getPageVersions } from '@/lib/queries/knowledge';
import { VersionHistory } from '@/components/knowledge/VersionHistory';
import { ArrowLeft } from 'lucide-react';

type Props = { params: Promise<{ pageId: string }> };

export default async function VersionHistoryPage({ params }: Props) {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    notFound();
  }

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  const versions = await getPageVersions(pageId, session.workspaceId);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/knowledge/${pageId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to page
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Version History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{page.title}</p>
        </div>
      </div>

      {versions.length === 0 ? (
        <p className="text-muted-foreground italic">No versions found.</p>
      ) : (
        <VersionHistory versions={versions} pageId={pageId} />
      )}
    </div>
  );
}
```

---

## Task 7: Review panel + review page

**Files:**
- Create: `apps/web/components/knowledge/ReviewPanel.tsx`
- Create: `apps/web/app/(app)/knowledge/[pageId]/review/page.tsx`

- [ ] **Step 1: Create `apps/web/components/knowledge/ReviewPanel.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Send, Clock } from 'lucide-react';

type PublishStatus = 'draft' | 'review' | 'published' | 'archived';

interface ReviewPanelProps {
  pageId: string;
  publishStatus: PublishStatus;
  canReview: boolean; // has KNOWLEDGE_REVIEW permission
  canEdit: boolean;   // has KNOWLEDGE_UPDATE permission
}

const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_VARIANTS: Record<PublishStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  review: 'default',
  published: 'outline',
  archived: 'destructive',
};

export function ReviewPanel({ pageId, publishStatus, canReview, canEdit }: ReviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const postReview = async (action: 'submit' | 'approve' | 'reject') => {
    setError(null);
    setSuccess(null);

    if (action === 'reject' && !comment.trim()) {
      setError('A comment is required when rejecting');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/knowledge/${pageId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, comment: comment || undefined }),
        });

        const data = await res.json() as { error?: string; publishStatus?: string };

        if (!res.ok) {
          setError(data.error ?? 'Action failed');
          return;
        }

        const messages: Record<string, string> = {
          submit: 'Submitted for review',
          approve: 'Page approved and published',
          reject: 'Page rejected and returned to draft',
        };
        setSuccess(messages[action] ?? 'Done');
        setComment('');
        router.refresh();
      } catch {
        setError('Network error — please try again');
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Publish Status</CardTitle>
          <Badge variant={STATUS_VARIANTS[publishStatus]}>{STATUS_LABELS[publishStatus]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Submit for review (editor action) */}
        {publishStatus === 'draft' && canEdit && (
          <Button
            className="w-full"
            onClick={() => postReview('submit')}
            disabled={isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
        )}

        {/* Review actions (reviewer-only) */}
        {publishStatus === 'review' && canReview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              This page is awaiting review
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-comment">Comment</Label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (required for rejection)"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => postReview('approve')}
                disabled={isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => postReview('reject')}
                disabled={isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {publishStatus === 'published' && (
          <p className="text-sm text-muted-foreground">
            This page is published. Edit it to create a new draft version.
          </p>
        )}

        {publishStatus === 'archived' && (
          <p className="text-sm text-muted-foreground">This page is archived.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/knowledge/[pageId]/review/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { ReviewPanel } from '@/components/knowledge/ReviewPanel';
import { ArrowLeft } from 'lucide-react';

type Props = { params: Promise<{ pageId: string }> };

export default async function ReviewPage({ params }: Props) {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    notFound();
  }

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  const canReview = hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE);

  // Only allow access if the page is in a reviewable state or user is a reviewer
  if (!canReview && !canEdit) notFound();

  const mdxContent = page.currentVersion?.mdxContent ?? '';
  const publishStatus = (page.publishStatus ?? 'draft') as 'draft' | 'review' | 'published' | 'archived';

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/knowledge/${pageId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to page
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Review: {page.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">{page.pageType}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="min-w-0">
          <PageViewer mdxContent={mdxContent} />
        </div>
        <div className="space-y-4">
          <ReviewPanel
            pageId={pageId}
            publishStatus={publishStatus}
            canReview={canReview}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
```

---

## Task 8: Knowledge pages (viewer, hubs)

**Files:**
- Create: `apps/web/components/knowledge/PageMetaSidebar.tsx`
- Create: `apps/web/app/(app)/knowledge/[pageId]/page.tsx`
- Create: `apps/web/app/(app)/knowledge/page.tsx`
- Create: `apps/web/app/(app)/knowledge/new/page.tsx`
- Create: `apps/web/app/(app)/knowledge/[pageId]/edit/page.tsx`
- Create: `apps/web/app/(app)/knowledge/onboarding/page.tsx`
- Create: `apps/web/app/(app)/knowledge/hr/page.tsx`
- Create: `apps/web/app/(app)/knowledge/tools/page.tsx`
- Create: `apps/web/app/(app)/knowledge/faq/page.tsx`
- Create: `apps/web/app/(app)/knowledge/glossary/page.tsx`

- [ ] **Step 1: Create `apps/web/components/knowledge/PageMetaSidebar.tsx`**

```tsx
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Edit, Clock, History, ShieldCheck, Tag } from 'lucide-react';
import type { KnowledgePageWithVersion } from '@/lib/queries/knowledge';

interface PageMetaSidebarProps {
  page: KnowledgePageWithVersion;
  canEdit: boolean;
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  project: 'Project', system: 'System', access: 'Access',
  runbook: 'Runbook', onboarding: 'Onboarding', 'hr-policy': 'HR Policy',
  'tool-guide': 'Tool Guide', faq: 'FAQ', decision: 'Decision',
  incident: 'Incident', analysis: 'Analysis', glossary: 'Glossary',
};

const SENSITIVITY_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PUBLIC: 'outline',
  INTERNAL: 'secondary',
  RESTRICTED: 'default',
  SECRET_REF_ONLY: 'destructive',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  review: 'default',
  published: 'outline',
  archived: 'destructive',
};

export function PageMetaSidebar({ page, canEdit }: PageMetaSidebarProps) {
  const frontmatter = (page.currentVersion?.frontmatter ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [];
  const versionNumber = page.currentVersion?.versionNumber ?? 1;

  return (
    <aside className="space-y-4 text-sm">
      {canEdit && (
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={`/knowledge/${page.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" /> Edit Page
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href={`/knowledge/${page.id}/review`}>Review</Link>
          </Button>
          <Button variant="ghost" asChild className="w-full">
            <Link href={`/knowledge/${page.id}/history`}>
              <History className="h-4 w-4 mr-2" /> Version History
            </Link>
          </Button>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge variant={STATUS_VARIANTS[page.publishStatus ?? 'draft']}>
            {page.publishStatus ?? 'draft'}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="font-medium">{PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Sensitivity
          </span>
          <Badge variant={SENSITIVITY_VARIANTS[page.sensitivity ?? 'INTERNAL']}>
            {page.sensitivity ?? 'INTERNAL'}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono font-medium">v{versionNumber}</span>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 flex-none" />
          <span>
            Updated{' '}
            {page.updatedAt
              ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
              : '—'}
          </span>
        </div>
      </div>

      {tags.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {page.summary && (
        <>
          <Separator />
          <div className="space-y-1">
            <span className="text-muted-foreground">Summary</span>
            <p className="text-xs leading-relaxed">{page.summary}</p>
          </div>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/knowledge/[pageId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { PageMetaSidebar } from '@/components/knowledge/PageMetaSidebar';

type Props = { params: Promise<{ pageId: string }> };

export default async function KnowledgePageView({ params }: Props) {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    notFound();
  }

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  // Enforce sensitivity visibility rules
  const canViewRestricted = hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
  if (
    (page.sensitivity === 'RESTRICTED' || page.sensitivity === 'SECRET_REF_ONLY') &&
    !canViewRestricted
  ) {
    notFound();
  }

  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE);
  const mdxContent = page.currentVersion?.mdxContent ?? '';

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8">
        <article className="min-w-0">
          <header className="mb-6">
            <h1 className="text-3xl font-bold">{page.title}</h1>
            {page.summary && (
              <p className="mt-2 text-muted-foreground">{page.summary}</p>
            )}
          </header>
          <PageViewer mdxContent={mdxContent} />
        </article>

        <PageMetaSidebar page={page} canEdit={canEdit} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(app)/knowledge/page.tsx`** — Knowledge home

```tsx
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getPagesByType } from '@/lib/queries/knowledge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen } from 'lucide-react';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';

const HUB_SECTIONS = [
  { label: 'Onboarding', type: 'onboarding', href: '/knowledge/onboarding' },
  { label: 'HR Policies', type: 'hr-policy', href: '/knowledge/hr' },
  { label: 'Tool Guides', type: 'tool-guide', href: '/knowledge/tools' },
  { label: 'FAQ', type: 'faq', href: '/knowledge/faq' },
  { label: 'Glossary', type: 'glossary', href: '/knowledge/glossary' },
  { label: 'Runbooks', type: 'runbook', href: '/knowledge?pageType=runbook' },
  { label: 'Decisions', type: 'decision', href: '/knowledge?pageType=decision' },
  { label: 'Incidents', type: 'incident', href: '/knowledge?pageType=incident' },
] as const;

export default async function KnowledgeHomePage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    notFound();
  }

  const canCreate = hasPermission(session, PERMISSIONS.KNOWLEDGE_CREATE);

  const sectionData = await Promise.all(
    HUB_SECTIONS.map(async (section) => ({
      ...section,
      pages: await getPagesByType(session.workspaceId, section.type, 4),
    })),
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">Company-wide documentation and guides</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/knowledge/new">
              <Plus className="h-4 w-4 mr-2" /> New Page
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sectionData.map((section) => (
          <Card key={section.type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{section.label}</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={section.href}>View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.pages.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No pages yet</p>
              ) : (
                section.pages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/knowledge/${page.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-sm"
                  >
                    <span className="truncate font-medium">{page.title}</span>
                    <span className="flex-none text-xs text-muted-foreground ml-2">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/app/(app)/knowledge/new/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageEditor } from '@/components/knowledge/PageEditor';

export default async function NewKnowledgePage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_CREATE)) {
    notFound();
  }

  return <PageEditor mode="create" />;
}
```

- [ ] **Step 5: Create `apps/web/app/(app)/knowledge/[pageId]/edit/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageEditor } from '@/components/knowledge/PageEditor';

type Props = { params: Promise<{ pageId: string }> };

export default async function EditKnowledgePage({ params }: Props) {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE)) {
    notFound();
  }

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  const frontmatter = (page.currentVersion?.frontmatter ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [];

  return (
    <PageEditor
      mode="edit"
      pageId={pageId}
      initialValues={{
        title: page.title,
        slug: page.slug,
        pageType: page.pageType,
        sensitivity: page.sensitivity ?? 'INTERNAL',
        mdxContent: page.currentVersion?.mdxContent ?? '',
        tags,
        summary: page.summary ?? '',
      }}
    />
  );
}
```

- [ ] **Step 6: Create `apps/web/app/(app)/knowledge/onboarding/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GraduationCap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function OnboardingHubPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) notFound();

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'onboarding',
    publishStatus: 'published',
    limit: 50,
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-sm text-muted-foreground">Get up to speed with the company</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-muted-foreground italic">No onboarding documents published yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <Link href={`/knowledge/${page.id}`} className="block space-y-1">
                  <p className="font-semibold hover:underline">{page.title}</p>
                  {page.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{page.summary}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-xs">{page.sensitivity}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/web/app/(app)/knowledge/hr/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function HRHubPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) notFound();

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'hr-policy',
    publishStatus: 'published',
    limit: 50,
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">HR Policies</h1>
          <p className="text-sm text-muted-foreground">Company policies and guidelines</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-muted-foreground italic">No HR policy documents published yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <Link href={`/knowledge/${page.id}`} className="block space-y-1">
                  <p className="font-semibold hover:underline">{page.title}</p>
                  {page.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{page.summary}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="secondary" className="text-xs">HR Policy</Badge>
                    <span className="text-xs text-muted-foreground">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create `apps/web/app/(app)/knowledge/tools/page.tsx`**

```tsx
import { notFound } from 'next/function';
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function ToolsHubPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) notFound();

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'tool-guide',
    publishStatus: 'published',
    limit: 50,
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Tool Guides</h1>
          <p className="text-sm text-muted-foreground">How-to guides for company tools</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-muted-foreground italic">No tool guides published yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <Link href={`/knowledge/${page.id}`} className="block space-y-1">
                  <p className="font-semibold hover:underline">{page.title}</p>
                  {page.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{page.summary}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-xs">{page.sensitivity}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Create `apps/web/app/(app)/knowledge/faq/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default async function FAQHubPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) notFound();

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'faq',
    publishStatus: 'published',
    limit: 100,
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">FAQ</h1>
          <p className="text-sm text-muted-foreground">Frequently asked questions</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-muted-foreground italic">No FAQ entries published yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {pages.map((page) => (
            <AccordionItem key={page.id} value={page.id} className="border rounded-lg px-4">
              <AccordionTrigger className="font-medium text-left hover:no-underline">
                {page.title}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                {page.summary ?? (
                  <Link href={`/knowledge/${page.id}`} className="underline text-primary">
                    Read full answer
                  </Link>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Create `apps/web/app/(app)/knowledge/glossary/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { BookMarked } from 'lucide-react';

export default async function GlossaryPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) notFound();

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'glossary',
    publishStatus: 'published',
    limit: 200,
  });

  // Group by first letter
  const grouped = pages.reduce<Record<string, typeof pages>>((acc, page) => {
    const letter = page.title.charAt(0).toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(page);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <BookMarked className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Glossary</h1>
          <p className="text-sm text-muted-foreground">Company-wide terminology reference</p>
        </div>
      </div>

      {/* Alphabet quick-nav */}
      {letters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="w-8 h-8 flex items-center justify-center rounded-md border text-sm font-medium hover:bg-muted transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {letters.length === 0 ? (
        <p className="text-muted-foreground italic">No glossary entries published yet.</p>
      ) : (
        <div className="space-y-8">
          {letters.map((letter) => (
            <section key={letter} id={`letter-${letter}`}>
              <h2 className="text-xl font-bold border-b pb-2 mb-4">{letter}</h2>
              <dl className="space-y-4">
                {grouped[letter].map((page) => (
                  <div key={page.id}>
                    <dt>
                      <Link
                        href={`/knowledge/${page.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {page.title}
                      </Link>
                    </dt>
                    {page.summary && (
                      <dd className="text-sm text-muted-foreground mt-0.5 pl-4">
                        {page.summary}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Playwright test**

Create `apps/web/e2e/knowledge.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Knowledge Platform', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes dev auth bypass is set up (e.g., dev login cookie)
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('creates a knowledge page and views rendered MDX', async ({ page }) => {
    await page.goto('/knowledge/new');
    await expect(page.getByText('New Knowledge Page')).toBeVisible();

    // Fill metadata
    await page.fill('#title', 'Test Onboarding Guide');
    // Slug auto-fills from title

    // Select page type
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Onboarding' }).click();

    // Fill MDX content
    await page.fill('textarea', '# Welcome\n\nThis is a **test** onboarding page.\n\n- Item 1\n- Item 2');

    // Save
    await page.getByRole('button', { name: 'Create Page' }).click();

    // Should redirect to page viewer
    await page.waitForURL(/\/knowledge\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Welcome', level: 1 })).toBeVisible();
    await expect(page.getByText('This is a')).toBeVisible();
  });

  test('knowledge home shows categorized sections', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.getByText('Knowledge Base')).toBeVisible();
    await expect(page.getByText('Onboarding')).toBeVisible();
    await expect(page.getByText('HR Policies')).toBeVisible();
    await expect(page.getByText('FAQ')).toBeVisible();
    await expect(page.getByText('Glossary')).toBeVisible();
  });

  test('version history shows versions and diff dialog', async ({ page }) => {
    // Navigate to a known page's history
    await page.goto('/knowledge');
    const firstLink = page.locator('a[href^="/knowledge/"]').first();
    const href = await firstLink.getAttribute('href');
    if (!href) return test.skip();

    await page.goto(`${href}/history`);
    await expect(page.getByText('Version History')).toBeVisible();
    await expect(page.getByText('v1')).toBeVisible();
  });
});
```

---

## Task 9: Commit

- [ ] **Step 1: Commit**

```bash
git add \
  apps/web/app/\(app\)/knowledge/ \
  apps/web/app/api/knowledge/ \
  apps/web/components/knowledge/ \
  apps/web/lib/queries/knowledge.ts \
  apps/web/styles/mdx.css \
  apps/web/e2e/knowledge.spec.ts
git commit -m "feat: knowledge platform — MDX editor/viewer, versioning, review workflow, hubs"
```

---

## Notes for Implementing Agent

1. **Import fix needed in tools/page.tsx**: The import `from 'next/function'` is incorrect — use `from 'next/navigation'`.
2. **Preview API**: `PageEditor` calls `/api/knowledge/preview` for the live preview tab. Create `apps/web/app/api/knowledge/preview/route.ts` with a POST handler that compiles MDX server-side using `next-mdx-remote` and returns rendered HTML, or use a simpler approach with a React Server Component island.
3. **Version content endpoint**: `VersionDiff` calls `/api/knowledge/${pageId}/versions/${versionId}` — add `apps/web/app/api/knowledge/[pageId]/versions/[versionId]/route.ts` that returns the full version including `mdxContent`.
4. **`@jarvis/db/schema/user`**: Ensure the `user` table export is available from this path. Adjust the import if the schema uses a different path (e.g., `@jarvis/db/schema/tenant`).
5. **`date-fns`**: Add `date-fns` to `apps/web/package.json` dependencies if not already present.
6. **shadcn/ui components required**: `Accordion`, `Badge`, `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`, `Separator`, `Skeleton`, `Table`, `Tabs`, `Textarea`, `Alert`. Run `npx shadcn@latest add <component>` for any missing ones.
