import {
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  clientCompanyId: uuid("client_company_id").references(() => company.id),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdBy: uuid("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projectTask = pgTable("project_task", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  status: varchar("status", { length: 30 }).default("todo").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  dueDate: date("due_date"),
  assigneeId: uuid("assignee_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projectInquiry = pgTable("project_inquiry", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => user.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  status: varchar("status", { length: 30 }).default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projectStaff = pgTable("project_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  role: varchar("role", { length: 100 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projectRelations = relations(project, ({ many }) => ({
  tasks: many(projectTask),
  inquiries: many(projectInquiry),
  staff: many(projectStaff)
}));

export const projectTaskRelations = relations(projectTask, ({ one }) => ({
  project: one(project, { fields: [projectTask.projectId], references: [project.id] }),
  assignee: one(user, { fields: [projectTask.assigneeId], references: [user.id] })
}));
