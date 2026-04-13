import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`
});

const tsvectorType = customType<{ data: string }>({
  dataType: () => "tsvector"
});

export const knowledgePage = pgTable("knowledge_page", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  pageType: varchar("page_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull(),
  summary: text("summary"),
  sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
  publishStatus: varchar("publish_status", { length: 30 }).default("draft").notNull(),
  freshnessSlaDays: integer("freshness_sla_days").default(90).notNull(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  sourceType: varchar("source_type", { length: 50 }),
  sourceKey: varchar("source_key", { length: 1000 }),
  searchVector: tsvectorType("search_vector"),

  // 4-surface 지식 모델 (2026-04-13)
  // surface: 지식 표면 종류
  // - canonical: 정본 위키
  // - directory: 디렉터리/담당자
  // - case: 사례 레이어
  // - derived: 파생 레이어
  surface: varchar("surface", { length: 20 }).default("canonical").notNull(),
  // authority: 지식 권위 수준
  // - canonical: 사람이 승인한 정본
  // - curated: 검토된 큐레이션
  // - generated: LLM 생성 파생 문서
  // - imported: 외부 import 원본
  authority: varchar("authority", { length: 20 }).default("canonical"),
  ownerTeam: varchar("owner_team", { length: 100 }),
  audience: varchar("audience", { length: 50 }).default("all-employees"),
  reviewCycleDays: integer("review_cycle_days").default(90),
  // domain: 업무 도메인 분류 (hr, it, admin, welfare, onboarding, project, system 등)
  domain: varchar("domain", { length: 50 }),
  // sourceOrigin: 원본 출처 (imported-notion, imported-tsvd, manual, graphify, codex)
  sourceOrigin: varchar("source_origin", { length: 50 }),
}, (table) => ({
  externalKeyIdx: uniqueIndex("idx_knowledge_page_external_key")
    .on(table.workspaceId, table.sourceType, table.sourceKey)
    .where(sql`source_type IS NOT NULL`),
  sourceOriginIdx: index("idx_knowledge_page_source_origin").on(
    table.workspaceId,
    table.sourceOrigin,
  ),
}));

export const knowledgePageVersion = pgTable("knowledge_page_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => knowledgePage.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  mdxContent: text("mdx_content").notNull(),
  frontmatter: jsonb("frontmatter")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  changeNote: varchar("change_note", { length: 500 }),
  authorId: uuid("author_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  pageIdx: index("idx_knowledge_page_version_page").on(table.pageId),
}));

export const knowledgeClaim = pgTable("knowledge_claim", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => knowledgePage.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").default(0).notNull(),
  claimText: text("claim_text").notNull(),
  sourceRefId: uuid("source_ref_id"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  embedding: vector("embedding"),
  verified: boolean("verified").default(false).notNull(),
  verifiedBy: uuid("verified_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  pageIdx: index("idx_knowledge_claim_page").on(table.pageId),
}));

export const knowledgePageOwner = pgTable(
  "knowledge_page_owner",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => knowledgePage.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pageId, table.userId] })
  })
);

export const knowledgePageTag = pgTable(
  "knowledge_page_tag",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => knowledgePage.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pageId, table.tag] })
  })
);

export const knowledgePageRelations = relations(knowledgePage, ({ many }) => ({
  versions: many(knowledgePageVersion),
  claims: many(knowledgeClaim),
  owners: many(knowledgePageOwner),
  tags: many(knowledgePageTag)
}));
