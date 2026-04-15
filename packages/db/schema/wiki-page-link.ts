import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { wikiPageIndex } from "./wiki-page-index.js";

/**
 * packages/db/schema/wiki-page-link.ts
 *
 * Phase-W1 T4 — `[[wikilink]]` 그래프 projection (WIKI-AGENTS.md §7).
 *
 * - `fromPageId` → `toPageId` 방향(direct)과 인바운드(inbound) 양쪽을 저장.
 * - `toPageId`는 target이 아직 생성되지 않은 경우 nullable. 이때 `toPath`가 예약(placeholder)
 *   역할을 하여 lint가 broken-link 탐지 가능.
 * - `alias`·`anchor`는 `[[page|별칭]]`·`[[folder/page#anchor]]` 문법을 반영.
 * - 1-hop 확장 쿼리(page-first navigation §3.2)의 핵심 테이블.
 */
export const wikiPageLink = pgTable(
  "wiki_page_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fromPageId: uuid("from_page_id")
      .notNull()
      .references(() => wikiPageIndex.id, { onDelete: "cascade" }),
    toPageId: uuid("to_page_id").references(() => wikiPageIndex.id, {
      onDelete: "cascade",
    }),
    toPath: varchar("to_path", { length: 500 }),
    alias: varchar("alias", { length: 200 }),
    anchor: varchar("anchor", { length: 200 }),
    // direct: fromPage 본문에서 [[...]]로 선언한 아웃바운드 링크
    // inbound: lint가 역방향으로 재계산한 역링크(복제 projection — hub page 스코어링용)
    kind: varchar("kind", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // 동일 fromPage에서 동일 (toPath, alias, anchor) 조합은 1회만
    fromToUniq: uniqueIndex("wiki_page_link_from_to_uniq").on(
      t.fromPageId,
      t.toPath,
      t.alias,
      t.anchor,
    ),
    toPageIdx: index("wiki_page_link_to_page_idx").on(t.toPageId),
    toPathIdx: index("wiki_page_link_to_path_idx").on(t.toPath),
    wsIdx: index("wiki_page_link_ws_idx").on(t.workspaceId),
  }),
);

export type WikiPageLink = typeof wikiPageLink.$inferSelect;
export type NewWikiPageLink = typeof wikiPageLink.$inferInsert;
