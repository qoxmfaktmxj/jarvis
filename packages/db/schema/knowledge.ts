import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
  searchVector: tsvectorType("search_vector")
});

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
});

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
});

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
