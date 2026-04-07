import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { knowledgePage } from "./knowledge.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const system = pgTable("system", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  name: varchar("name", { length: 300 }).notNull(),
  companyId: uuid("company_id").references(() => company.id),
  ownerId: uuid("owner_id").references(() => user.id),
  category: varchar("category", { length: 50 }),
  environment: varchar("environment", { length: 30 }),
  sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  description: text("description"),
  techStack: varchar("tech_stack", { length: 500 }),
  repositoryUrl: varchar("repository_url", { length: 500 }),
  dashboardUrl: varchar("dashboard_url", { length: 500 }),
  knowledgePageId: uuid("knowledge_page_id").references(() => knowledgePage.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const systemAccess = pgTable("system_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  systemId: uuid("system_id")
    .notNull()
    .references(() => system.id, { onDelete: "cascade" }),
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
});

export const systemRelations = relations(system, ({ many }) => ({
  accessEntries: many(systemAccess)
}));
