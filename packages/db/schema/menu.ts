import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const menuKindEnum = pgEnum("menu_kind", ["menu", "action"]);

export const menuItem = pgTable(
  "menu_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => menuItem.id, {
      onDelete: "cascade",
    }),
    code: varchar("code", { length: 100 }).notNull(),
    kind: menuKindEnum("kind").notNull().default("menu"),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    routePath: varchar("route_path", { length: 300 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    // @deprecated rbac-menu-tree (2026-04-30): replaced by menu_permission junction.
    // Kept for backwards compat; will be dropped after all readers migrate to permission-based gating.
    requiredRole: varchar("required_role", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsCodeUnique: uniqueIndex("menu_item_ws_code_unique").on(t.workspaceId, t.code),
  }),
);
