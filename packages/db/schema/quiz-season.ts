import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

/**
 * quiz_season — 1달 단위 위키 퀴즈 시즌.
 *
 * 매월 1일 KST 00:01에 worker(quiz-season-rotate)가 직전 시즌 종료(leaderboard
 * snapshot freeze + mascot unlock 처리) + 새 시즌 row 생성.
 * 사용자가 풀 때마다 quiz_season_score에 점수 누적.
 */
export const quizSeason = pgTable(
  "quiz_season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    leaderboardSnapshot: jsonb("leaderboard_snapshot")
  },
  (table) => ({
    wsActiveIdx: index("idx_quiz_season_ws_active").on(
      table.workspaceId,
      table.endedAt
    )
  })
);

export const quizSeasonScore = pgTable(
  "quiz_season_score",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => quizSeason.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    score: integer("score").default(0).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    correct: integer("correct").default(0).notNull(),
    lastAnsweredAt: timestamp("last_answered_at", { withTimezone: true })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.seasonId, table.userId] }),
    seasonScoreIdx: index("idx_quiz_season_score_score").on(
      table.seasonId,
      table.score
    ),
    seasonOrgIdx: index("idx_quiz_season_score_org").on(
      table.seasonId,
      table.orgId
    )
  })
);

/**
 * mascot_unlock — 사용자별 unlock된 mascot 컬렉션.
 *
 * 시즌 1위 → 희귀 1개, 2-3위 → 일반 1개, 시즌 첫 참여 → baseline(basic, reading, zen).
 * 헤더 mascot rotate에서 unlock된 것만 노출.
 */
export const mascotUnlock = pgTable(
  "mascot_unlock",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mascotId: text("mascot_id").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    seasonId: uuid("season_id").references(() => quizSeason.id, {
      onDelete: "set null"
    })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.mascotId] })
  })
);

export const quizSeasonRelations = relations(quizSeason, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [quizSeason.workspaceId],
    references: [workspace.id]
  }),
  scores: many(quizSeasonScore),
  unlocks: many(mascotUnlock)
}));

export const quizSeasonScoreRelations = relations(
  quizSeasonScore,
  ({ one }) => ({
    season: one(quizSeason, {
      fields: [quizSeasonScore.seasonId],
      references: [quizSeason.id]
    }),
    user: one(user, {
      fields: [quizSeasonScore.userId],
      references: [user.id]
    })
  })
);

export const mascotUnlockRelations = relations(mascotUnlock, ({ one }) => ({
  user: one(user, {
    fields: [mascotUnlock.userId],
    references: [user.id]
  }),
  season: one(quizSeason, {
    fields: [mascotUnlock.seasonId],
    references: [quizSeason.id]
  })
}));
