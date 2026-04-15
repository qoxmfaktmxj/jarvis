import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { rawSource } from "./file.js";

/**
 * packages/db/schema/wiki-commit-log.ts
 *
 * Phase-W1 T4 — git commit metadata projection (WIKI-AGENTS.md §5, §7).
 *
 * - workspace당 독립 git repo의 모든 커밋 메타를 DB에 mirror. G8 commit-log 무결성 게이트의
 *   근거 테이블 (`commitSha == git log HEAD`).
 * - `operation`: `ingest | lint | synthesis | manual` (WIKI-AGENTS §5 규약).
 * - `authorType`: `llm | user | system`.
 *   - llm: `authorRef` = `jarvis-llm@{workspaceId}` (auto/**에만 커밋)
 *   - user: `authorRef` = 사용자 id/email (manual/**에만 커밋)
 *   - system: `authorRef` = job 식별자 (bootstrap, lint cron 등)
 * - `affectedPages`: jsonb 배열로 `wiki_page_index.id` 목록 저장 (Step C 결과).
 * - `sourceRefId`: ingest 오퍼레이션일 때 origin raw_source 링크. nullable (lint/synthesis/manual).
 */
export const wikiCommitLog = pgTable(
  "wiki_commit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    operation: varchar("operation", { length: 20 }).notNull(),
    authorType: varchar("author_type", { length: 10 }).notNull(),
    authorRef: varchar("author_ref", { length: 200 }),
    affectedPages: jsonb("affected_pages")
      .$type<string[]>()
      .default([])
      .notNull(),
    reasoning: text("reasoning"),
    sourceRefId: uuid("source_ref_id").references(() => rawSource.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // commitSha는 전역 유니크 (git이 보장; projection도 동일 불변량)
    commitShaUniq: uniqueIndex("wiki_commit_log_commit_sha_uniq").on(
      t.commitSha,
    ),
    wsCreatedIdx: index("wiki_commit_log_ws_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
    operationIdx: index("wiki_commit_log_operation_idx").on(t.operation),
  }),
);

export type WikiCommitLog = typeof wikiCommitLog.$inferSelect;
export type NewWikiCommitLog = typeof wikiCommitLog.$inferInsert;
