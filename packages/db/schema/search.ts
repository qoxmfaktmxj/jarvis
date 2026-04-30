import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const searchLog = pgTable("search_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  userId: uuid("user_id").references(() => user.id),
  query: text("query").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  resultCount: integer("result_count"),
  clickedPageId: uuid("clicked_page_id"),
  clickedRank: integer("clicked_rank"),
  responseMs: integer("response_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const searchSynonym = pgTable("search_synonym", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  term: varchar("term", { length: 200 }).notNull(),
  synonyms: varchar("synonyms", { length: 200 }).array().notNull()
});

export const popularSearch = pgTable(
  "popular_search",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    query: varchar("query", { length: 500 }).notNull(),
    count: integer("count").default(0).notNull(),
    period: date("period").notNull()
  },
  (table) => ({
    // Code review HIGH G — aggregate-popular cron 이 onConflict 대상으로 사용.
    // UNIQUE 가 없으면 conflict 없이 매 실행마다 중복 row 가 누적됨.
    wsQueryPeriodUnique: uniqueIndex("popular_search_ws_query_period_unique").on(
      table.workspaceId,
      table.query,
      table.period
    )
  })
);
