import {
  date,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

/**
 * packages/db/schema/wiki-lint-report.ts
 *
 * Phase-W1 T4 — 주간 lint 리포트 요약 projection (WIKI-AGENTS.md §3.3, §7).
 *
 * - 실제 상세 리포트 본문(md)은 디스크 `wiki/{workspaceId}/_system/lint-report-{date}.md`에 저장.
 *   DB는 dashboard용 집계 수치만 보관 (본문 저장 금지 — G11과 동일 불변량).
 * - `reportPath`는 디스크 상대 경로 포인터.
 * - workspace당 1일 1리포트.
 */
export const wikiLintReport = pgTable(
  "wiki_lint_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    reportDate: date("report_date").notNull(),
    orphanCount: integer("orphan_count").default(0).notNull(),
    brokenLinkCount: integer("broken_link_count").default(0).notNull(),
    noOutlinkCount: integer("no_outlink_count").default(0).notNull(),
    contradictionCount: integer("contradiction_count").default(0).notNull(),
    staleCount: integer("stale_count").default(0).notNull(),
    reportPath: varchar("report_path", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    wsDateUniq: uniqueIndex("wiki_lint_report_ws_date_uniq").on(
      t.workspaceId,
      t.reportDate,
    ),
  }),
);

export type WikiLintReport = typeof wikiLintReport.$inferSelect;
export type NewWikiLintReport = typeof wikiLintReport.$inferInsert;
