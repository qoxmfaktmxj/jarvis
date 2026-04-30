import { z } from "zod";

export const quizDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type QuizDifficulty = z.infer<typeof quizDifficultySchema>;

export const quizGeneratedBySchema = z.enum(["llm", "human"]);
export type QuizGeneratedBy = z.infer<typeof quizGeneratedBySchema>;

export const QUIZ_OPTIONS_COUNT = 4;
export const QUIZ_DAILY_CHUNK = 5;
export const QUIZ_BATCH_TARGET_COUNT = 30;

export const quizOptionsSchema = z
  .array(z.string().min(1).max(300))
  .length(QUIZ_OPTIONS_COUNT);

export const quizQuestionSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1),
  options: quizOptionsSchema,
  difficulty: quizDifficultySchema,
  sourcePagePath: z.string().min(1)
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizTodayResponseSchema = z.object({
  seasonId: z.string().uuid().nullable(),
  seasonName: z.string().nullable(),
  questions: z.array(quizQuestionSchema).max(QUIZ_DAILY_CHUNK),
  cumulativeScore: z.number().int().nonnegative(),
  remainingThisWeek: z.number().int().nonnegative()
});
export type QuizTodayResponse = z.infer<typeof quizTodayResponseSchema>;

export const quizAnswerInputSchema = z.object({
  quizId: z.string().uuid(),
  chosenIndex: z.number().int().min(0).max(QUIZ_OPTIONS_COUNT - 1)
});
export type QuizAnswerInput = z.infer<typeof quizAnswerInputSchema>;

export const quizAnswerOutputSchema = z.object({
  correct: z.boolean(),
  answerIndex: z.number().int().min(0).max(QUIZ_OPTIONS_COUNT - 1),
  explanation: z.string().nullable(),
  sourcePagePath: z.string(),
  scoreDelta: z.number().int().nonnegative(),
  newScore: z.number().int().nonnegative(),
  unlockedMascots: z.array(z.string())
});
export type QuizAnswerOutput = z.infer<typeof quizAnswerOutputSchema>;

/**
 * LLM batch generator output schema (single quiz).
 * 모델이 JSON으로 만들 때 이 shape을 강제한다.
 */
export const llmGeneratedQuizSchema = z.object({
  question: z.string().min(8).max(500),
  options: quizOptionsSchema,
  answerIndex: z.number().int().min(0).max(QUIZ_OPTIONS_COUNT - 1),
  explanation: z.string().min(4).max(600),
  difficulty: quizDifficultySchema
});
export type LlmGeneratedQuiz = z.infer<typeof llmGeneratedQuizSchema>;
