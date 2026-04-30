/**
 * packages/db/schema/sales-mail-person.ts
 *
 * 영업관리 메일 담당자 테이블 (TBIZ029).
 *
 * - salesMailPerson: 영업/인사 메일 수신 담당자 마스터
 */
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const salesMailPerson = pgTable(
  "sales_mail_person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    sabun: text("sabun").notNull(),
    name: text("name").notNull(),
    salesYn: boolean("sales_yn").default(false).notNull(),
    insaYn: boolean("insa_yn").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("sales_mail_person_uniq").on(t.workspaceId, t.sabun),
    wsIdx: index("sales_mail_person_ws_idx").on(t.workspaceId),
  }),
);
