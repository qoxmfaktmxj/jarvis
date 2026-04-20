import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspace } from "./tenant.js";

/**
 * packages/db/schema/wiki-page-index.ts
 *
 * Phase-W1 T4 — Wiki projection 색인 테이블 (WIKI-AGENTS.md §7).
 *
 * - SSoT는 디스크(`wiki/{workspaceId}/**.md`) + git. 이 테이블은 **projection/색인 전용**.
 * - 본문(mdxContent/body)은 절대 저장하지 않는다. frontmatter 메타만 jsonb로 담는다.
 * - page-first navigation의 lexical shortlist 기반(`title`, `slug`, `frontmatter->aliases`).
 * - sensitivity 값 규약: `PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY` (Jarvis 관례의
 *   `varchar(30)` 패턴 재사용; 별도 pgEnum 도입 없음 — `knowledge_page`·`raw_source` 등과 동일).
 * - `publishedStatus`: `draft | published | archived`.
 * - `authority`: `auto | manual` (auto: LLM 편집, manual: 사람 편집).
 * - `type`: `source | entity | concept | synthesis | derived`.
 */
export const wikiPageIndex = pgTable(
  "wiki_page_index",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 500 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    /** Full path-based key for routing (e.g. "hr/leave-policy"). Nullable for backcompat. */
    routeKey: varchar("route_key", { length: 500 }),
    type: varchar("type", { length: 20 }).notNull(),
    authority: varchar("authority", { length: 10 }).notNull(),
    sensitivity: varchar("sensitivity", { length: 30 })
      .default("INTERNAL")
      .notNull(),
    requiredPermission: varchar("required_permission", { length: 50 }),
    frontmatter: jsonb("frontmatter")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    gitSha: varchar("git_sha", { length: 40 }).notNull(),
    stale: boolean("stale").default(false).notNull(),
    publishedStatus: varchar("published_status", { length: 10 })
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    freshnessSlaDays: integer("freshness_sla_days"),
    /** 120-200자 페이지 요약. wiki-reproject가 frontmatter.summary 또는 body 첫 문단에서 추출. */
    snippet: varchar("snippet", { length: 200 }),
  },
  (t) => ({
    // 동일 workspace 내 동일 path 금지 (디스크 경로 == projection key)
    wsPathUniq: uniqueIndex("wiki_page_index_ws_path_uniq").on(
      t.workspaceId,
      t.path,
    ),
    // page-first shortlist 주 쿼리: workspace별 type + publishedStatus
    wsTypePublishedIdx: index("wiki_page_index_ws_type_published_idx").on(
      t.workspaceId,
      t.type,
      t.publishedStatus,
    ),
    // workspace + routeKey unique (null은 Postgres unique에서 제외되므로 안전)
    wsRouteKeyUniq: uniqueIndex("wiki_page_index_ws_route_key_uniq").on(
      t.workspaceId,
      t.routeKey,
    ),
    // frontmatter->aliases 검색용 GIN 인덱스 (한국어 동의어 매칭 — MindVault 실패 재발 방지)
    aliasesGinIdx: index("wiki_page_index_aliases_gin")
      .using("gin", sql`(${t.frontmatter} -> 'aliases')`),
  }),
);

export type WikiPageIndex = typeof wikiPageIndex.$inferSelect;
export type NewWikiPageIndex = typeof wikiPageIndex.$inferInsert;
