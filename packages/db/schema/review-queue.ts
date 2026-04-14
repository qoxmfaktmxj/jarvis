import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    documentId: uuid("document_id"),
    documentType: text("document_type").notNull(),
    // e.g. 'SECRET_KEYWORD' | 'PII_MANUAL_REVIEW'
    reason: text("reason").notNull(),
    // matched keyword list, e.g. ['비밀번호', 'api_key']
    matchedKeywords: jsonb("matched_keywords")
      .$type<string[]>()
      .default([])
      .notNull(),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => user.id),
  },
  (t) => ({
    statusIdx: index("review_queue_ws_status_idx").on(
      t.workspaceId,
      t.status,
    ),
    createdIdx: index("review_queue_ws_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

export type ReviewQueue = typeof reviewQueue.$inferSelect;
export type NewReviewQueue = typeof reviewQueue.$inferInsert;
