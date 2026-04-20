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

