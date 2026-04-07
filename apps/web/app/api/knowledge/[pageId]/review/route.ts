import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { reviewRequest } from '@jarvis/db/schema/review';
import { requireApiSession } from '@/lib/server/api-auth';
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
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

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

        const [req] = await tx
          .insert(reviewRequest)
          .values({
            pageId,
            workspaceId: session.workspaceId,
            requesterId: session.userId,
            reviewerId: data.reviewerId ?? null,
            status: 'pending',
          })
          .returning();

        return { publishStatus: 'review', reviewRequest: req, requiresReview: true };
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
