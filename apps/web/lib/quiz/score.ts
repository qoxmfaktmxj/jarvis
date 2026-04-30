import type { QuizDifficulty } from "@jarvis/shared/validation/quiz";

export const SCORE_TABLE: Record<QuizDifficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 30
};

export function scoreFor(difficulty: QuizDifficulty, correct: boolean): number {
  if (!correct) return 0;
  return SCORE_TABLE[difficulty] ?? 0;
}
