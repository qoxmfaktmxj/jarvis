import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";

/**
 * code_group — 그룹코드 마스터.
 *
 * Phase /admin/codes grid overhaul: legacy `grpCdMgr.jsp` 마스터 그리드와 1:1 매핑.
 * - description, name_en, business_div_code, kind_code, common_yn 컬럼 신설
 * - kind_code 기본값 'C' (사용자코드), common_yn 기본값 false
 * - business_div_code는 code_group의 한 그룹의 코드값을 참조하는 string FK처럼 동작 (DB 제약은 두지 않음)
 */
export const codeGroup = pgTable(
  "code_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    nameEn: varchar("name_en", { length: 200 }),
    description: text("description"),
    businessDivCode: varchar("business_div_code", { length: 50 }),
    kindCode: varchar("kind_code", { length: 10 }).default("C").notNull(),
    commonYn: boolean("common_yn").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull()
  },
  (t) => ({
    wsCodeUniq: uniqueIndex("code_group_ws_code_uniq").on(t.workspaceId, t.code)
  })
);

/**
 * code_item — 세부코드.
 *
 * Phase /admin/codes grid overhaul: legacy `grpCdMgr.jsp` 디테일 그리드(IBSheet) 컬럼과 1:1 매핑.
 * - memo, full_name, note1~note9, num_note, sdate, edate, visual_yn 컬럼 신설
 * - sdate 기본값 1900-01-01, edate 기본값 2999-12-31, visual_yn 기본값 true
 */
export const codeItem = pgTable(
  "code_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => codeGroup.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    nameEn: varchar("name_en", { length: 200 }),
    fullName: text("full_name"),
    memo: text("memo"),
    note1: text("note1"),
    note2: text("note2"),
    note3: text("note3"),
    note4: text("note4"),
    note5: text("note5"),
    note6: text("note6"),
    note7: text("note7"),
    note8: text("note8"),
    note9: text("note9"),
    numNote: integer("num_note"),
    sdate: date("sdate").default("1900-01-01").notNull(),
    edate: date("edate").default("2999-12-31").notNull(),
    visualYn: boolean("visual_yn").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull()
  },
  (t) => ({
    groupCodeUniq: uniqueIndex("code_item_group_code_uniq").on(t.groupId, t.code)
  })
);

export const codeGroupRelations = relations(codeGroup, ({ many }) => ({
  items: many(codeItem)
}));
