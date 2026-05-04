import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const scheduleEvent = pgTable(
  "schedule_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    memo: text("memo"),
    orderSeq: integer("order_seq").default(0).notNull(),
    isShared: boolean("is_shared").default(false).notNull(),
    updatedBy: varchar("updated_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_schedule_user").on(t.userId),
    dateIdx: index("idx_schedule_date").on(t.startDate, t.endDate),
    workspaceIdx: index("idx_schedule_ws").on(t.workspaceId),
    sharedIdx: index("idx_schedule_shared").on(t.workspaceId, t.isShared),
    unq: unique("schedule_user_start_seq_unique").on(t.userId, t.startDate, t.orderSeq)
  })
);

export const scheduleEventRelations = relations(scheduleEvent, ({ one }) => ({
  user: one(user, { fields: [scheduleEvent.userId], references: [user.id] })
}));
