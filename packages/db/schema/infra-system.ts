/**
 * packages/db/schema/infra-system.ts
 *
 * 인프라구성관리 — Grid SoT (자산 카탈로그) + Wiki runbook 보조.
 *
 * 사용자 명시 (Plan 5): "인프라구성관리 = SSMS의 raison d'être".
 * Grid 컬럼 11개로 회사·시스템·환경별 자산을 한눈에. 자유 텍스트 runbook
 * (DB 종류, 배포 방식, 트러블슈팅)은 wiki/jarvis/auto/infra/**.md 페이지에
 * 두고, infra_system.wikiPageId 로 link 한다 (wiki_page_index 는 워커
 * sync 잡만 INSERT/UPDATE; UI server action 은 wikiPageId UPDATE 만).
 *
 * sensitivity: wiki-page-index/knowledge_page 컨벤션과 동일하게
 * varchar(30) default "INTERNAL" (대문자). 접속 정보(domainAddr/port/owner*)가
 * 포함되므로 RESTRICTED 격상 가능 (Phase J/추후).
 *
 * Audit 컬럼: sales/* + infra-license 컨벤션 (createdBy/updatedBy uuid,
 * user.id FK 두지 않음).
 */
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { workspace } from "./tenant.js";
import { wikiPageIndex } from "./wiki-page-index.js";

export const infraSystem = pgTable(
  "infra_system",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),

    systemName: varchar("system_name", { length: 200 }).notNull(),
    envType: varchar("env_type", { length: 30 }),
    domainAddr: text("domain_addr"),
    port: integer("port"),
    dbType: varchar("db_type", { length: 30 }),
    dbVersion: varchar("db_version", { length: 30 }),
    osType: varchar("os_type", { length: 50 }),
    osVersion: varchar("os_version", { length: 50 }),

    connectMethod: varchar("connect_method", { length: 50 }),
    deployMethod: varchar("deploy_method", { length: 50 }),
    deployFolder: text("deploy_folder"),

    ownerName: varchar("owner_name", { length: 100 }),
    ownerContact: varchar("owner_contact", { length: 100 }),

    wikiPageId: uuid("wiki_page_id").references(() => wikiPageIndex.id, {
      onDelete: "set null",
    }),

    note: text("note"),
    sensitivity: varchar("sensitivity", { length: 30 })
      .default("INTERNAL")
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    companyIdx: index("idx_infra_system_company").on(t.companyId),
    envIdx: index("idx_infra_system_env").on(t.envType),
    dbIdx: index("idx_infra_system_db").on(t.dbType),
    wsCompanyIdx: index("idx_infra_system_ws_company").on(
      t.workspaceId,
      t.companyId,
    ),
    wsSensIdx: index("idx_infra_system_ws_sens").on(
      t.workspaceId,
      t.sensitivity,
    ),
    companyNameEnvUniq: uniqueIndex("infra_system_company_name_env_uniq").on(
      t.companyId,
      t.systemName,
      t.envType,
    ),
  }),
);

export const infraSystemRelations = relations(infraSystem, ({ one }) => ({
  company: one(company, {
    fields: [infraSystem.companyId],
    references: [company.id],
  }),
  wikiPage: one(wikiPageIndex, {
    fields: [infraSystem.wikiPageId],
    references: [wikiPageIndex.id],
  }),
}));

export type InfraSystem = typeof infraSystem.$inferSelect;
export type NewInfraSystem = typeof infraSystem.$inferInsert;
