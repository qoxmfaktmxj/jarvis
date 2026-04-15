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
  // Phase-W2 P4: kind classification (contradiction|lint-report|sensitivity_escalation|boundary_violation)
  // nullable — 기존 레코드는 NULL, ingest/lint 워커가 채운다
  kind: varchar("kind", { length: 50 }),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
}, (table) => ({
  pageIdx: index("idx_review_request_page").on(table.pageId),
  wsKindStatusIdx: index("idx_review_request_ws_kind_status").on(
    table.workspaceId,
    table.kind,
    table.status,
  ),
}));
