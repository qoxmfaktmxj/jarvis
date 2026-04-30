import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  mascotUnlock,
  quizSeason,
  quizSeasonScore,
  wikiQuiz,
  wikiQuizAttempt
} from "@jarvis/db/schema";
import {
  QUIZ_DAILY_CHUNK,
  type QuizDifficulty,
  type QuizQuestion
} from "@jarvis/shared/validation/quiz";
import { kstDateKey, seededShuffle } from "@/lib/quiz/seeded-shuffle.js";
import { BASELINE_MASCOTS } from "@/lib/quiz/mascot-pool.js";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

export interface ActiveSeason {
  id: string;
  name: string;
  startedAt: Date;
}

export async function getActiveSeason(
  workspaceId: string,
  database: DbOrTx = db
): Promise<ActiveSeason | null> {
  const rows = await database
    .select({
      id: quizSeason.id,
      name: quizSeason.name,
      startedAt: quizSeason.startedAt
    })
    .from(quizSeason)
    .where(
      and(eq(quizSeason.workspaceId, workspaceId), isNull(quizSeason.endedAt))
    )
    .orderBy(desc(quizSeason.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

interface UnansweredQuiz {
  id: string;
  question: string;
  options: string[];
  difficulty: QuizDifficulty;
  sourcePagePath: string;
}

/**
 * 사용자가 아직 안 푼 퀴즈를 모두 가져온다 (workspace 격리).
 * NOT EXISTS 패턴 — 본 문제 다시 안 보여주기.
 */
export async function listUnansweredQuizzes(
  workspaceId: string,
  userId: string,
  database: DbOrTx = db
): Promise<UnansweredQuiz[]> {
  const rows = await database
    .select({
      id: wikiQuiz.id,
      question: wikiQuiz.question,
      options: wikiQuiz.options,
      difficulty: wikiQuiz.difficulty,
      sourcePagePath: wikiQuiz.sourcePagePath
    })
    .from(wikiQuiz)
    .where(
      and(
        eq(wikiQuiz.workspaceId, workspaceId),
        sql`NOT EXISTS (
          SELECT 1 FROM ${wikiQuizAttempt}
          WHERE ${wikiQuizAttempt.quizId} = ${wikiQuiz.id}
            AND ${wikiQuizAttempt.userId} = ${userId}
        )`
      )
    );
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
    difficulty: r.difficulty as QuizDifficulty,
    sourcePagePath: r.sourcePagePath
  }));
}

/**
 * 결정론적 일일 chunk: hash(userId + dateKST) seed로 섞은 뒤
 * difficulty 균형(easy 2, medium 2, hard 1)에 맞게 5개 추출.
 * 부족하면 가능한 만큼만.
 */
export function pickDailyChunk(
  pool: UnansweredQuiz[],
  userId: string,
  now: Date = new Date()
): UnansweredQuiz[] {
  if (pool.length === 0) return [];
  const seed = `quiz-chunk:${userId}:${kstDateKey(now)}`;
  const shuffled = seededShuffle(pool, seed);

  const target: Record<QuizDifficulty, number> = { easy: 2, medium: 2, hard: 1 };
  const picked: UnansweredQuiz[] = [];
  const remainingByDifficulty = { ...target };

  for (const q of shuffled) {
    if (picked.length >= QUIZ_DAILY_CHUNK) break;
    if (remainingByDifficulty[q.difficulty] > 0) {
      picked.push(q);
      remainingByDifficulty[q.difficulty] -= 1;
    }
  }
  if (picked.length < QUIZ_DAILY_CHUNK) {
    const pickedIds = new Set(picked.map((p) => p.id));
    for (const q of shuffled) {
      if (picked.length >= QUIZ_DAILY_CHUNK) break;
      if (!pickedIds.has(q.id)) picked.push(q);
    }
  }
  return picked;
}

export async function getTodayQuestionsForUser(
  workspaceId: string,
  userId: string,
  now: Date = new Date(),
  database: DbOrTx = db
): Promise<QuizQuestion[]> {
  const pool = await listUnansweredQuizzes(workspaceId, userId, database);
  const chunk = pickDailyChunk(pool, userId, now);
  return chunk.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    sourcePagePath: q.sourcePagePath
  }));
}

export async function getCumulativeScore(
  seasonId: string,
  userId: string,
  database: DbOrTx = db
): Promise<number> {
  const rows = await database
    .select({ score: quizSeasonScore.score })
    .from(quizSeasonScore)
    .where(
      and(
        eq(quizSeasonScore.seasonId, seasonId),
        eq(quizSeasonScore.userId, userId)
      )
    )
    .limit(1);
  return rows[0]?.score ?? 0;
}

export async function getRemainingUnansweredCount(
  workspaceId: string,
  userId: string,
  database: DbOrTx = db
): Promise<number> {
  const rows = await database
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(wikiQuiz)
    .where(
      and(
        eq(wikiQuiz.workspaceId, workspaceId),
        sql`NOT EXISTS (
          SELECT 1 FROM ${wikiQuizAttempt}
          WHERE ${wikiQuizAttempt.quizId} = ${wikiQuiz.id}
            AND ${wikiQuizAttempt.userId} = ${userId}
        )`
      )
    );
  return rows[0]?.cnt ?? 0;
}

/**
 * 퀴즈 단건 조회 (채점용). workspace 격리.
 */
export async function getQuizById(
  workspaceId: string,
  quizId: string,
  database: DbOrTx = db
): Promise<{
  id: string;
  workspaceId: string;
  answerIndex: number;
  difficulty: QuizDifficulty;
  explanation: string | null;
  sourcePagePath: string;
} | null> {
  const rows = await database
    .select({
      id: wikiQuiz.id,
      workspaceId: wikiQuiz.workspaceId,
      answerIndex: wikiQuiz.answerIndex,
      difficulty: wikiQuiz.difficulty,
      explanation: wikiQuiz.explanation,
      sourcePagePath: wikiQuiz.sourcePagePath
    })
    .from(wikiQuiz)
    .where(
      and(eq(wikiQuiz.workspaceId, workspaceId), eq(wikiQuiz.id, quizId))
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, difficulty: row.difficulty as QuizDifficulty };
}

export interface RecordAttemptInput {
  workspaceId: string;
  userId: string;
  orgId: string | null;
  quizId: string;
  chosenIndex: number;
  correct: boolean;
  scoreDelta: number;
  seasonId: string | null;
}

export interface RecordAttemptResult {
  duplicate: boolean;
  newScore: number;
  ensuredBaselineMascots: string[];
}

/**
 * 답안 기록 + 점수 갱신을 하나의 트랜잭션으로 처리.
 * uq_wiki_quiz_attempt_user_quiz 충돌 시 duplicate=true 반환 (이미 푼 문제).
 *
 * 시즌 첫 참여 시 BASELINE 3종 (basic/reading/zen) 자동 unlock.
 */
export async function recordAttempt(
  input: RecordAttemptInput,
  database: DbOrTx = db
): Promise<RecordAttemptResult> {
  return database.transaction(async (tx) => {
    const insertRes = await tx
      .insert(wikiQuizAttempt)
      .values({
        userId: input.userId,
        quizId: input.quizId,
        seasonId: input.seasonId,
        chosenIndex: input.chosenIndex,
        correct: input.correct
      })
      .onConflictDoNothing({
        target: [wikiQuizAttempt.userId, wikiQuizAttempt.quizId]
      })
      .returning({ id: wikiQuizAttempt.id });

    if (insertRes.length === 0) {
      const cur = input.seasonId
        ? await getCumulativeScore(input.seasonId, input.userId, tx)
        : 0;
      return { duplicate: true, newScore: cur, ensuredBaselineMascots: [] };
    }

    let ensuredBaseline: string[] = [];
    let newScore = 0;

    if (input.seasonId) {
      const isFirstAttempt = await isFirstSeasonAttempt(
        input.seasonId,
        input.userId,
        tx
      );

      const upserted = await tx
        .insert(quizSeasonScore)
        .values({
          seasonId: input.seasonId,
          userId: input.userId,
          orgId: input.orgId,
          score: input.scoreDelta,
          attempts: 1,
          correct: input.correct ? 1 : 0,
          lastAnsweredAt: new Date()
        })
        .onConflictDoUpdate({
          target: [quizSeasonScore.seasonId, quizSeasonScore.userId],
          set: {
            score: sql`${quizSeasonScore.score} + ${input.scoreDelta}`,
            attempts: sql`${quizSeasonScore.attempts} + 1`,
            correct: sql`${quizSeasonScore.correct} + ${input.correct ? 1 : 0}`,
            lastAnsweredAt: new Date(),
            orgId: input.orgId
          }
        })
        .returning({ score: quizSeasonScore.score });
      newScore = upserted[0]?.score ?? 0;

      if (isFirstAttempt) {
        const inserted = await tx
          .insert(mascotUnlock)
          .values(
            BASELINE_MASCOTS.map((mascotId) => ({
              userId: input.userId,
              mascotId,
              seasonId: input.seasonId
            }))
          )
          .onConflictDoNothing({
            target: [mascotUnlock.userId, mascotUnlock.mascotId]
          })
          .returning({ mascotId: mascotUnlock.mascotId });
        ensuredBaseline = inserted.map((r) => r.mascotId);
      }
    }

    return { duplicate: false, newScore, ensuredBaselineMascots: ensuredBaseline };
  });
}

async function isFirstSeasonAttempt(
  seasonId: string,
  userId: string,
  database: DbOrTx
): Promise<boolean> {
  const rows = await database
    .select({ attempts: quizSeasonScore.attempts })
    .from(quizSeasonScore)
    .where(
      and(
        eq(quizSeasonScore.seasonId, seasonId),
        eq(quizSeasonScore.userId, userId)
      )
    )
    .limit(1);
  return (rows[0]?.attempts ?? 0) === 0;
}
