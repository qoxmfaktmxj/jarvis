import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

/**
 * ask_conversation — Ask AI 대화 세션.
 * 사용자당 최대 20개, FIFO 삭제 정책.
 */
export const askConversation = pgTable(
  "ask_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    askMode: varchar("ask_mode", { length: 10 }).default("simple"),
    snapshotId: uuid("snapshot_id"),
    messageCount: integer("message_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userLastMsgIdx: index("idx_ask_conv_user_last_msg").on(
      t.workspaceId,
      t.userId,
      t.lastMessageAt,
    ),
  }),
);

/**
 * ask_message — 대화 내 개별 메시지 (질문 + 답변 쌍).
 * CASCADE: 대화 삭제 시 메시지도 자동 삭제.
 */
export const askMessage = pgTable(
  "ask_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => askConversation.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 10 }).notNull(), // 'user' | 'assistant'
    content: text("content").notNull(),
    sources: jsonb("sources").$type<unknown[]>().default([]),
    lane: varchar("lane", { length: 40 }),
    totalTokens: integer("total_tokens"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    convOrderIdx: index("idx_ask_msg_conv_order").on(
      t.conversationId,
      t.sortOrder,
    ),
  }),
);

export type AskConversation = typeof askConversation.$inferSelect;
export type NewAskConversation = typeof askConversation.$inferInsert;
export type AskMessage = typeof askMessage.$inferSelect;
export type NewAskMessage = typeof askMessage.$inferInsert;
