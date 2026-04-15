import {
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { rawSource } from "./file.js";
import { wikiPageIndex } from "./wiki-page-index.js";

/**
 * packages/db/schema/wiki-page-source-ref.ts
 *
 * Phase-W1 T4 — Wiki page ↔ raw_source 연결 projection (WIKI-AGENTS.md §7).
 *
 * - 한 raw_source가 여러 wiki page에 기여하고, 한 wiki page가 여러 raw_source를 참조한다(N:M).
 * - `confidence`는 Graphify 3-tier(`EXTRACTED=1.00 / INFERRED=0.xx / AMBIGUOUS=<0.5`)를 담기 위한
 *   decimal(3,2). 기본값 1.00 = LLM ingest가 명시적으로 인용한 경우.
 * - ON DELETE RESTRICT: raw_source가 삭제되면 먼저 ingest를 되돌려야 함(감사 추적 유지).
 */
export const wikiPageSourceRef = pgTable(
  "wiki_page_source_ref",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPageIndex.id, { onDelete: "cascade" }),
    rawSourceId: uuid("raw_source_id")
      .notNull()
      .references(() => rawSource.id, { onDelete: "restrict" }),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .default("1.00")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pageIdx: index("wiki_page_source_ref_page_idx").on(t.pageId),
    sourceIdx: index("wiki_page_source_ref_source_idx").on(t.rawSourceId),
    wsIdx: index("wiki_page_source_ref_ws_idx").on(t.workspaceId),
  }),
);

export type WikiPageSourceRef = typeof wikiPageSourceRef.$inferSelect;
export type NewWikiPageSourceRef = typeof wikiPageSourceRef.$inferInsert;
