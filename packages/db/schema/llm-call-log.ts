import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const llmCallLog = pgTable(
  "llm_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    requestId: varchar("request_id", { length: 64 }),
    model: varchar("model", { length: 100 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 50 }),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .default("0")
      .notNull(),
    durationMs: integer("duration_ms").default(0).notNull(),
    // 'ok' | 'error' | 'blocked_by_budget'
    status: varchar("status", { length: 30 }).notNull(),
    blockedBy: text("blocked_by"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceIdx: index("idx_llm_call_log_workspace").on(t.workspaceId),
    requestIdx: index("idx_llm_call_log_request").on(t.requestId),
    createdAtIdx: index("idx_llm_call_log_created_at").on(t.createdAt),
  }),
);

export type LlmCallLog = typeof llmCallLog.$inferSelect;
export type NewLlmCallLog = typeof llmCallLog.$inferInsert;
