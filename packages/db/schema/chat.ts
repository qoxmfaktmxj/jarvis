import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    wsCreatedIdx: index("idx_chat_msg_ws_created").on(
      t.workspaceId,
      t.createdAt
    )
  })
);

export const chatReaction = pgTable(
  "chat_reaction",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessage.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    emojiCheck: check(
      "chat_reaction_emoji_chk",
      sql`emoji IN ('👍','❤️','🎉','😂','🙏')`
    )
  })
);

export const chatMessageRelations = relations(chatMessage, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [chatMessage.workspaceId],
    references: [workspace.id]
  }),
  author: one(user, {
    fields: [chatMessage.userId],
    references: [user.id]
  }),
  reactions: many(chatReaction)
}));

export const chatReactionRelations = relations(chatReaction, ({ one }) => ({
  message: one(chatMessage, {
    fields: [chatReaction.messageId],
    references: [chatMessage.id]
  }),
  user: one(user, {
    fields: [chatReaction.userId],
    references: [user.id]
  })
}));
