import { date, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const company = pgTable("company", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  groupCode: varchar("group_code", { length: 50 }),
  category: varchar("category", { length: 50 }),
  representative: varchar("representative", { length: 100 }),
  startDate: date("start_date"),
  industryCode: varchar("industry_code", { length: 50 }),
  address: text("address"),
  homepage: varchar("homepage", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
