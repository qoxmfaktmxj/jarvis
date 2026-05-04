import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

/**
 * Legacy SSMS의 TSMT030 (FAQ 관리) → jarvis faq_entry.
 * workspace 내 SEQ 자동 증가. server action 이 트랜잭션에서 max(seq)+1 계산.
 */
export const faqEntry = pgTable(
  "faq_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    seq: integer("seq").notNull(),
    bizCode: varchar("biz_code", { length: 20 }),
    question: varchar("question", { length: 500 }).notNull(),
    answer: text("answer").notNull(),
    /** 첨부파일 SEQ (legacy FILE_SEQ) — file storage 통합 시 file_id 로 전환 예정 */
    fileSeq: varchar("file_seq", { length: 50 }),
    updatedBy: varchar("updated_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    workspaceIdx: index("idx_faq_ws").on(t.workspaceId),
    bizCodeIdx: index("idx_faq_biz").on(t.bizCode),
    unq: unique("faq_ws_seq_unique").on(t.workspaceId, t.seq)
  })
);
