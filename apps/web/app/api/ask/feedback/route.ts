// apps/web/app/api/ask/feedback/route.ts
// P4: Ask AI 답변 피드백 수집 (thumbs up/down + optional comment).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { answerFeedback } from '@jarvis/db/schema/feedback';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  answerPreview: z.string().max(300).optional(),
  lane: z.string().max(40).optional(),
  sourceRefs: z.array(z.string()).max(40).optional(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(2000).optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    await db.insert(answerFeedback).values({
      workspaceId: session.workspaceId,
      userId: session.userId,
      question: body.question,
      answerPreview: body.answerPreview,
      lane: body.lane,
      sourceRefs: body.sourceRefs ?? [],
      rating: body.rating,
      comment: body.comment,
      totalTokens: body.totalTokens,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[feedback] insert failed:', err);
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 });
  }
}
