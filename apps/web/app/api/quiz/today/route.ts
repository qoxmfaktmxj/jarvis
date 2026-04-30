import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/api-auth";
import {
  getActiveSeason,
  getCumulativeScore,
  getRemainingUnansweredCount,
  getTodayQuestionsForUser
} from "@/lib/queries/quiz";
import { quizTodayResponseSchema } from "@jarvis/shared/validation/quiz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;
  const { workspaceId, userId } = auth.session;

  const now = new Date();
  const season = await getActiveSeason(workspaceId);
  const [questions, cumulativeScore, remainingThisWeek] = await Promise.all([
    getTodayQuestionsForUser(workspaceId, userId, now),
    season ? getCumulativeScore(season.id, userId) : Promise.resolve(0),
    getRemainingUnansweredCount(workspaceId, userId)
  ]);

  const body = quizTodayResponseSchema.parse({
    seasonId: season?.id ?? null,
    seasonName: season?.name ?? null,
    questions,
    cumulativeScore,
    remainingThisWeek
  });
  return NextResponse.json(body);
}
