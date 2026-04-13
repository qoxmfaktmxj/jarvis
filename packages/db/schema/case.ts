// packages/db/schema/case.ts
// Cases Layer: TSVD999 유사 문의/사례 데이터를 정규화해 저장하는 스키마

import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";
import { knowledgePage } from "./knowledge.js";

// knowledge.ts와 동일한 pgvector customType (1536d)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`,
});

// ---------------------------------------------------------------------------
// precedent_case: 개별 문의/사례 row (TSVD999 레코드 1건 = 1 row)
// ---------------------------------------------------------------------------
export const precedentCase = pgTable(
  "precedent_case",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),

    // --- TSVD999 원본 필드 매핑 ---
    sourceKey: varchar("source_key", { length: 300 }),
    originalSeq: integer("original_seq"), // SEQ
    higherCategory: varchar("higher_category", { length: 100 }), // HIGHER_NM
    lowerCategory: varchar("lower_category", { length: 100 }), // LOWER_NM
    appMenu: varchar("app_menu", { length: 500 }), // APP_MENU
    processType: varchar("process_type", { length: 100 }), // PROCESS_NM

    // --- 정규화된 상담 필드 ---
    title: varchar("title", { length: 500 }).notNull(),
    symptom: text("symptom"),
    cause: text("cause"),
    action: text("action"),
    // result: resolved | workaround | escalated | no_fix | info_only
    result: varchar("result", { length: 30 }),

    // --- 고객/담당자 컨텍스트 ---
    requestCompany: varchar("request_company", { length: 100 }),
    managerTeam: varchar("manager_team", { length: 100 }),

    // --- 군집화 결과 ---
    clusterId: integer("cluster_id"),
    clusterLabel: varchar("cluster_label", { length: 200 }),
    isDigest: boolean("is_digest").default(false).notNull(),
    digestPageId: uuid("digest_page_id").references(() => knowledgePage.id, {
      onDelete: "set null",
    }),

    // --- 메타 ---
    // severity: low | medium | high | critical
    severity: varchar("severity", { length: 20 }),
    resolved: boolean("resolved").default(false),
    urgency: boolean("urgency").default(false),
    workHours: numeric("work_hours", { precision: 5, scale: 1 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // --- Jarvis 메타 ---
    sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
    // symptom + cause + action 합성 벡터 (semantic search)
    embedding: vector("embedding"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_precedent_case_workspace").on(table.workspaceId),
    clusterIdx: index("idx_precedent_case_cluster").on(
      table.workspaceId,
      table.clusterId,
    ),
    categoryIdx: index("idx_precedent_case_category").on(
      table.workspaceId,
      table.higherCategory,
      table.lowerCategory,
    ),
    companyIdx: index("idx_precedent_case_company").on(
      table.workspaceId,
      table.requestCompany,
    ),
    digestIdx: index("idx_precedent_case_digest").on(
      table.workspaceId,
      table.isDigest,
    ),
    digestPageIdx: index("idx_precedent_case_digest_page").on(
      table.digestPageId,
      table.workspaceId,
    ),
    sourceKeyIdx: uniqueIndex("idx_precedent_case_source_key")
      .on(table.workspaceId, table.sourceKey)
      .where(sql`source_key IS NOT NULL`),
  }),
);

// ---------------------------------------------------------------------------
// case_cluster: 군집 요약 (클러스터링 결과)
// ---------------------------------------------------------------------------
export const caseCluster = pgTable(
  "case_cluster",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),

    // 클러스터링 파이프라인이 부여한 정수 클러스터 ID (-1 = noise)
    numericClusterId: integer("numeric_cluster_id").notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    caseCount: integer("case_count").default(0).notNull(),

    // 군집 대표 사례
    digestCaseId: uuid("digest_case_id").references(() => precedentCase.id, {
      onDelete: "set null",
    }),
    // 대표 사례가 승격된 knowledge_page (있을 경우)
    digestPageId: uuid("digest_page_id").references(() => knowledgePage.id, {
      onDelete: "set null",
    }),

    // 군집 상위 증상/조치 키워드
    topSymptoms: jsonb("top_symptoms").$type<string[]>().default([]).notNull(),
    topActions: jsonb("top_actions").$type<string[]>().default([]).notNull(),
    topCategories: jsonb("top_categories").$type<string[]>().default([]).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceNumericIdx: uniqueIndex("uq_case_cluster_workspace_numeric").on(
      table.workspaceId,
      table.numericClusterId,
    ),
    digestCaseIdx: index("idx_case_cluster_digest_case").on(
      table.digestCaseId,
      table.workspaceId,
    ),
    digestPageIdx: index("idx_case_cluster_digest_page").on(
      table.digestPageId,
      table.workspaceId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const precedentCaseRelations = relations(precedentCase, ({ one }) => ({
  workspace: one(workspace, {
    fields: [precedentCase.workspaceId],
    references: [workspace.id],
  }),
  digestPage: one(knowledgePage, {
    fields: [precedentCase.digestPageId],
    references: [knowledgePage.id],
  }),
  cluster: one(caseCluster, {
    fields: [precedentCase.clusterId],
    references: [caseCluster.numericClusterId],
  }),
}));

export const caseClusterRelations = relations(caseCluster, ({ one }) => ({
  workspace: one(workspace, {
    fields: [caseCluster.workspaceId],
    references: [workspace.id],
  }),
  digestCase: one(precedentCase, {
    fields: [caseCluster.digestCaseId],
    references: [precedentCase.id],
  }),
  digestPage: one(knowledgePage, {
    fields: [caseCluster.digestPageId],
    references: [knowledgePage.id],
  }),
}));
