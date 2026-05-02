import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { knowledgePage } from "./knowledge.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => company.id),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  ownerId: uuid("owner_id").references(() => user.id),
  knowledgePageId: uuid("knowledge_page_id").references(() => knowledgePage.id),
  // 운영
  prodDomainUrl: varchar("prod_domain_url", { length: 500 }),
  prodConnectType: varchar("prod_connect_type", { length: 20 }),
  prodRepositoryUrl: varchar("prod_repository_url", { length: 500 }),
  prodDbDsn: varchar("prod_db_dsn", { length: 500 }),
  prodSrcPath: text("prod_src_path"),
  prodClassPath: text("prod_class_path"),
  prodMemo: text("prod_memo"),
  // 개발
  devDomainUrl: varchar("dev_domain_url", { length: 500 }),
  devConnectType: varchar("dev_connect_type", { length: 20 }),
  devRepositoryUrl: varchar("dev_repository_url", { length: 500 }),
  devDbDsn: varchar("dev_db_dsn", { length: 500 }),
  devSrcPath: text("dev_src_path"),
  devClassPath: text("dev_class_path"),
  devMemo: text("dev_memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  knowledgePageIdx: index("idx_project_knowledge_page").on(t.knowledgePageId),
  workspaceCompanyUnique: uniqueIndex("project_workspace_company_unique").on(t.workspaceId, t.companyId),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  company: one(company, { fields: [project.companyId], references: [company.id] }),
  owner: one(user, { fields: [project.ownerId], references: [user.id] }),
  knowledgePage: one(knowledgePage, { fields: [project.knowledgePageId], references: [knowledgePage.id] }),
  accessEntries: many(projectAccess),
}));

export const projectAccess = pgTable("project_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  envType: varchar("env_type", { length: 10 }).notNull(),
  accessType: varchar("access_type", { length: 50 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  host: varchar("host", { length: 500 }),
  port: integer("port"),
  usernameRef: varchar("username_ref", { length: 500 }),
  passwordRef: varchar("password_ref", { length: 500 }),
  connectionStringRef: varchar("connection_string_ref", { length: 500 }),
  vpnFileRef: varchar("vpn_file_ref", { length: 500 }),
  notes: text("notes"),
  requiredRole: varchar("required_role", { length: 50 }).default("DEVELOPER").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("idx_project_access_project").on(t.projectId),
}));

export const projectAccessRelations = relations(projectAccess, ({ one }) => ({
  project: one(project, { fields: [projectAccess.projectId], references: [project.id] }),
}));

export const projectBeacon = pgTable("project_beacon", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
  legacyBeaconMcd: varchar("legacy_beacon_mcd", { length: 100 }),
  legacyBeaconSer: varchar("legacy_beacon_ser", { length: 1000 }),
  beaconMcd: varchar("beacon_mcd", { length: 100 }),
  beaconSer: varchar("beacon_ser", { length: 1000 }),
  pjtCd: varchar("pjt_cd", { length: 20 }),
  pjtNm: varchar("pjt_nm", { length: 300 }),
  sdate: varchar("sdate", { length: 8 }),
  edate: varchar("edate", { length: 8 }),
  sabun: varchar("sabun", { length: 20 }),
  outYn: varchar("out_yn", { length: 10 }),
  bigo: varchar("bigo", { length: 4000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by")
}, (t) => ({
  wsIdx: index("project_beacon_ws_idx").on(t.workspaceId),
  wsPjtIdx: index("project_beacon_ws_pjt_idx").on(t.workspaceId, t.pjtCd),
  wsSabunIdx: index("project_beacon_ws_sabun_idx").on(t.workspaceId, t.sabun),
  // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any key column is NULL.
  legacyUniq: uniqueIndex("project_beacon_legacy_uniq").on(
    t.workspaceId,
    t.legacyEnterCd,
    t.legacyBeaconMcd,
    t.legacyBeaconSer
  )
}));

export const projectHistory = pgTable("project_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
  legacySabun: varchar("legacy_sabun", { length: 20 }),
  legacyOrgCd: varchar("legacy_org_cd", { length: 10 }),
  legacyPjtCd: varchar("legacy_pjt_cd", { length: 20 }),
  sabun: varchar("sabun", { length: 20 }),
  orgCd: varchar("org_cd", { length: 10 }),
  pjtCd: varchar("pjt_cd", { length: 20 }),
  pjtNm: varchar("pjt_nm", { length: 300 }),
  custCd: varchar("cust_cd", { length: 60 }),
  custNm: varchar("cust_nm", { length: 500 }),
  sdate: varchar("sdate", { length: 8 }),
  edate: varchar("edate", { length: 8 }),
  regCd: varchar("reg_cd", { length: 20 }),
  regNm: varchar("reg_nm", { length: 20 }),
  deReg: varchar("de_reg", { length: 40 }),
  flist: varchar("flist", { length: 1000 }),
  plist: varchar("plist", { length: 1000 }),
  roleCd: varchar("role_cd", { length: 20 }),
  roleNm: varchar("role_nm", { length: 20 }),
  module: varchar("module", { length: 500 }),
  /**
   * Daily work hours (e.g. "08:00~17:00"). Originally named `bigo` (비고/memo)
   * in the legacy Oracle TBIZ011, but operationally repurposed as a work-hours
   * field — verified by JSP `Header:"근무시간"` mapping and dump samples.
   * Renamed to `work_hours` here to remove the misleading legacy name.
   */
  workHours: varchar("work_hours", { length: 4000 }),
  memo: varchar("memo", { length: 4000 }),
  etc1: varchar("etc1", { length: 100 }),
  etc2: varchar("etc2", { length: 100 }),
  etc3: varchar("etc3", { length: 100 }),
  etc4: varchar("etc4", { length: 100 }),
  etc5: varchar("etc5", { length: 100 }),
  jobCd: varchar("job_cd", { length: 40 }),
  jobNm: varchar("job_nm", { length: 100 }),
  rewardYn: varchar("reward_yn", { length: 10 }),
  statusCd: varchar("status_cd", { length: 10 }),
  beaconMcd: varchar("beacon_mcd", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by")
}, (t) => ({
  wsIdx: index("project_history_ws_idx").on(t.workspaceId),
  wsPjtIdx: index("project_history_ws_pjt_idx").on(t.workspaceId, t.pjtCd),
  wsSabunIdx: index("project_history_ws_sabun_idx").on(t.workspaceId, t.sabun),
  wsDatesIdx: index("project_history_ws_dates_idx").on(t.workspaceId, t.sdate, t.edate),
  // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any key column is NULL.
  legacyUniq: uniqueIndex("project_history_legacy_uniq").on(
    t.workspaceId,
    t.legacyEnterCd,
    t.legacySabun,
    t.legacyOrgCd,
    t.legacyPjtCd
  )
}));

export const projectModule = pgTable("project_module", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
  legacySabun: varchar("legacy_sabun", { length: 20 }),
  legacyPjtCd: varchar("legacy_pjt_cd", { length: 20 }),
  legacyModuleCd: varchar("legacy_module_cd", { length: 20 }),
  sabun: varchar("sabun", { length: 20 }),
  pjtCd: varchar("pjt_cd", { length: 20 }),
  pjtNm: varchar("pjt_nm", { length: 300 }),
  moduleCd: varchar("module_cd", { length: 20 }),
  moduleNm: varchar("module_nm", { length: 300 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by")
}, (t) => ({
  wsIdx: index("project_module_ws_idx").on(t.workspaceId),
  wsPjtIdx: index("project_module_ws_pjt_idx").on(t.workspaceId, t.pjtCd),
  wsSabunIdx: index("project_module_ws_sabun_idx").on(t.workspaceId, t.sabun),
  // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any key column is NULL.
  legacyUniq: uniqueIndex("project_module_legacy_uniq").on(
    t.workspaceId,
    t.legacyEnterCd,
    t.legacySabun,
    t.legacyPjtCd,
    t.legacyModuleCd
  )
}));
