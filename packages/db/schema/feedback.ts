import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './user.js';
import { workspace } from './tenant.js';

/**
 * answer_feedback — Ask AI 답변에 대한 사용자 피드백.
 * 집계해서 지식 갭(답변 실패 패턴) 발견 용도.
 */
export const answerFeedback = pgTable(
  'answer_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id),
    userId: uuid('user_id').references(() => user.id),
    question: text('question').notNull(),
    // 답변 자체는 저장 안 함(프라이버시/용량). 요약 첫 300자만.
    answerPreview: varchar('answer_preview', { length: 300 }),
    // 라우터가 고른 lane (text-first | graph-first | case-first | ...)
    lane: varchar('lane', { length: 40 }),
    // 응답에 사용된 소스 id 배열 (kind:id 형식)
    sourceRefs: jsonb('source_refs').$type<string[]>().default([]),
    rating: varchar('rating', { length: 10 }).notNull(), // 'up' | 'down'
    comment: text('comment'), // 선택: 사용자가 남긴 코멘트
    totalTokens: integer('total_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    idxWorkspaceCreated: index('idx_af_workspace_created').on(
      t.workspaceId,
      t.createdAt,
    ),
    idxRating: index('idx_af_rating').on(t.rating),
    idxLane: index('idx_af_lane').on(t.lane),
  }),
);

export type AnswerFeedback = typeof answerFeedback.$inferSelect;
export type NewAnswerFeedback = typeof answerFeedback.$inferInsert;
