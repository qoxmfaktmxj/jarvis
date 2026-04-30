import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema";
import { requireApiSession } from "@/lib/server/api-auth";
import {
  getActiveSeason,
  getQuizById,
  recordAttempt
} from "@/lib/queries/quiz";
import { scoreFor } from "@/lib/quiz/score";
import {
  quizAnswerInputSchema,
  quizAnswerOutputSchema
} from "@jarvis/shared/validation/quiz";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;
  const { workspaceId, userId } = auth.session;

  const json = await request.json().catch(() => null);
  const parsed = quizAnswerInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const quiz = await getQuizById(workspaceId, parsed.data.quizId);
  if (!quiz) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const correct = parsed.data.chosenIndex === quiz.answerIndex;
  const scoreDelta = scoreFor(quiz.difficulty, correct);
  const season = await getActiveSeason(workspaceId);

  const orgRow = await db
    .select({ orgId: user.orgId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const orgId = orgRow[0]?.orgId ?? null;

  const result = await recordAttempt({
    workspaceId,
    userId,
    orgId,
    quizId: quiz.id,
    chosenIndex: parsed.data.chosenIndex,
    correct,
    scoreDelta,
    seasonId: season?.id ?? null
  });

  const body = quizAnswerOutputSchema.parse({
    correct,
    answerIndex: quiz.answerIndex,
    explanation: quiz.explanation,
    sourcePagePath: quiz.sourcePagePath,
    scoreDelta: result.duplicate ? 0 : scoreDelta,
    newScore: result.newScore,
    unlockedMascots: result.ensuredBaselineMascots
  });
  return NextResponse.json(body);
}
