import {
  boolean,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const menuItem = pgTable("menu_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  parentId: uuid("parent_id"),
  label: varchar("label", { length: 200 }).notNull(),
  icon: varchar("icon", { length: 100 }),
  routePath: varchar("route_path", { length: 300 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  requiredRole: varchar("required_role", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
