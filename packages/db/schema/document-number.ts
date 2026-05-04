import {
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

/**
 * Legacy SSMS의 TSMT050 (문서번호 관리) → jarvis document_number.
 * 회사가 발행하는 공식 문서의 연도별 일련번호 발급. 신규 입력 시 server
 * action 이 같은 (workspace, year) 안에서 max(seq)+1 을 트랜잭션으로 계산.
 * docNo 는 "HS-{yy}-{seq:03d}" 형식으로 자동 생성 (legacy 호환).
 */
export const documentNumber = pgTable(
  "document_number",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    year: varchar("year", { length: 4 }).notNull(),
    seq: integer("seq").notNull(),
    docNo: varchar("doc_no", { length: 30 }).notNull(),
    docName: varchar("doc_name", { length: 300 }).notNull(),
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "set null" }),
    docDate: date("doc_date"),
    note: text("note"),
    updatedBy: varchar("updated_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    yearIdx: index("idx_doc_num_year").on(t.year),
    workspaceYearIdx: index("idx_doc_num_ws_year").on(t.workspaceId, t.year),
    userIdx: index("idx_doc_num_user").on(t.userId),
    unq: unique("doc_num_ws_year_seq_unique").on(t.workspaceId, t.year, t.seq)
  })
);

export const documentNumberRelations = relations(documentNumber, ({ one }) => ({
  user: one(user, { fields: [documentNumber.userId], references: [user.id] })
}));
