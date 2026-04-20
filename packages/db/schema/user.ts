import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, workspace } from "./tenant.js";

export const userStatusEnum = pgEnum("user_status", ["active", "inactive", "locked"]);

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  employeeId: varchar("employee_id", { length: 50 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  orgId: uuid("org_id").references(() => organization.id),
  position: varchar("position", { length: 100 }),
  jobTitle: varchar("job_title", { length: 50 }),
  status: userStatusEnum("status").default("active").notNull(),
  isOutsourced: boolean("is_outsourced").default(false).notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  preferences: jsonb("preferences")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const permission = pgTable("permission", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: varchar("resource", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull()
});

export const userRole = pgTable(
  "user_role",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleId] })
  })
);

export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] })
  })
);

export const userRelations = relations(user, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [user.workspaceId],
    references: [workspace.id]
  }),
  org: one(organization, { fields: [user.orgId], references: [organization.id] }),
  userRoles: many(userRole)
}));

export const roleRelations = relations(role, ({ many }) => ({
  userRoles: many(userRole),
  rolePermissions: many(rolePermission)
}));
