import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

/**
 * wiki_quiz — 위키 페이지 기반 4지선다 퀴즈.
 *
 * worker가 매주 월요일 KST 06:00에 워크스페이스당 30문항을 LLM(gpt-5.4-mini)으로
 * 일괄 생성. 사용자는 매일 5문항 chunk로 풀이 (`/quiz/play`).
 * 본 문제 다시 안 보여주기 — wiki_quiz_attempt JOIN으로 NOT EXISTS.
 */
export const quizDifficultyEnum = pgEnum("quiz_difficulty", [
  "easy",
  "medium",
  "hard"
]);

export const quizGeneratedByEnum = pgEnum("quiz_generated_by", [
  "llm",
  "human"
]);

export const wikiQuizBatch = pgTable(
  "wiki_quiz_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    generatedBy: quizGeneratedByEnum("generated_by").notNull(),
    count: integer("count").notNull(),
    promptVersion: varchar("prompt_version", { length: 32 })
  },
  (table) => ({
    wsGenAtIdx: index("idx_wiki_quiz_batch_ws_gen_at").on(
      table.workspaceId,
      table.generatedAt
    )
  })
);

export const wikiQuiz = pgTable(
  "wiki_quiz",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => wikiQuizBatch.id, { onDelete: "cascade" }),
    sourcePagePath: text("source_page_path").notNull(),
    question: text("question").notNull(),
    options: jsonb("options").notNull(),
    answerIndex: integer("answer_index").notNull(),
    explanation: text("explanation"),
    difficulty: quizDifficultyEnum("difficulty").notNull(),
    generatedBy: quizGeneratedByEnum("generated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    wsBatchIdx: index("idx_wiki_quiz_ws_batch").on(
      table.workspaceId,
      table.batchId
    ),
    wsDifficultyIdx: index("idx_wiki_quiz_ws_difficulty").on(
      table.workspaceId,
      table.difficulty
    )
  })
);

export const wikiQuizAttempt = pgTable(
  "wiki_quiz_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => wikiQuiz.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id"),
    chosenIndex: integer("chosen_index").notNull(),
    correct: boolean("correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    userQuizUq: uniqueIndex("uq_wiki_quiz_attempt_user_quiz").on(
      table.userId,
      table.quizId
    ),
    userAnsweredIdx: index("idx_wiki_quiz_attempt_user_answered").on(
      table.userId,
      table.answeredAt
    )
  })
);

export const wikiQuizBatchRelations = relations(
  wikiQuizBatch,
  ({ one, many }) => ({
    workspace: one(workspace, {
      fields: [wikiQuizBatch.workspaceId],
      references: [workspace.id]
    }),
    quizzes: many(wikiQuiz)
  })
);

export const wikiQuizRelations = relations(wikiQuiz, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [wikiQuiz.workspaceId],
    references: [workspace.id]
  }),
  batch: one(wikiQuizBatch, {
    fields: [wikiQuiz.batchId],
    references: [wikiQuizBatch.id]
  }),
  attempts: many(wikiQuizAttempt)
}));

export const wikiQuizAttemptRelations = relations(
  wikiQuizAttempt,
  ({ one }) => ({
    user: one(user, {
      fields: [wikiQuizAttempt.userId],
      references: [user.id]
    }),
    quiz: one(wikiQuiz, {
      fields: [wikiQuizAttempt.quizId],
      references: [wikiQuiz.id]
    })
  })
);
