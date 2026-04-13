import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { knowledgePage } from "./knowledge.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const reviewRequest = pgTable("review_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  pageId: uuid("page_id").references(() => knowledgePage.id, { onDelete: "set null" }),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => user.id),
  reviewerId: uuid("reviewer_id").references(() => user.id),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
}, (table) => ({
  pageIdx: index("idx_review_request_page").on(table.pageId),
}));
