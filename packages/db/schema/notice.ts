import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

export const noticeSensitivityEnum = pgEnum("notice_sensitivity", [
  "PUBLIC",
  "INTERNAL"
]);

export const notice = pgTable(
  "notice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    bodyMd: text("body_md").notNull(),
    sensitivity: noticeSensitivityEnum("sensitivity")
      .default("INTERNAL")
      .notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    wsPinnedIdx: index("idx_notice_ws_pinned").on(
      table.workspaceId,
      table.pinned,
      table.publishedAt
    ),
    wsPublishedIdx: index("idx_notice_ws_published").on(
      table.workspaceId,
      table.publishedAt
    ),
    wsAuthorIdx: index("idx_notice_ws_author").on(
      table.workspaceId,
      table.authorId
    )
  })
);

export const noticeRelations = relations(notice, ({ one }) => ({
  workspace: one(workspace, {
    fields: [notice.workspaceId],
    references: [workspace.id]
  }),
  author: one(user, {
    fields: [notice.authorId],
    references: [user.id]
  })
}));
