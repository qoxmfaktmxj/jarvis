// packages/db/schema/directory.ts
// Directory Layer — 시스템 링크·양식·담당자·툴 디렉터리 (구조화된 경로 데이터)

import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";

// ---------------------------------------------------------------------------
// directory_entry — 내부 시스템·양식·담당자·링크 단일 항목
//
// Ask AI에서 "어디서 신청해?", "링크가 뭐야?", "담당자 누구야?" 같은 질문에
// 텍스트 설명 대신 바로가기 카드로 답하기 위한 구조화 데이터.
// ---------------------------------------------------------------------------
export const directoryEntry = pgTable(
  "directory_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),

    // entry_type: 항목 종류
    //   'tool'        — 조직 시스템·앱 (HR 시스템, 그룹웨어, ERP 등)
    //   'form'        — 신청서·양식 (근태 신청서, 출장 신청서 등)
    //   'contact'     — 담당자·팀 연락처
    //   'system_link' — 시스템 메뉴 직접 경로
    //   'guide_link'  — 외부 가이드 문서 링크
    entryType: varchar("entry_type", { length: 30 }).notNull(),

    name: varchar("name", { length: 200 }).notNull(),
    nameKo: varchar("name_ko", { length: 200 }),   // 한국어명 (검색 보조)
    description: text("description"),

    // 접근 URL (tool/system_link/form 다운로드 등)
    url: varchar("url", { length: 1000 }),

    // 카테고리 분류 (hr, it, admin, welfare, facility, onboarding 등)
    category: varchar("category", { length: 100 }),

    ownerTeam: varchar("owner_team", { length: 100 }),
    ownerContact: varchar("owner_contact", { length: 200 }), // 이메일 or 전화

    // 관련 knowledge_page slug (추가 설명 문서 링크용)
    relatedPageSlug: varchar("related_page_slug", { length: 500 }),

    // 추가 구조화 데이터 (자유 형식)
    // 예: { "loginMethod": "SSO", "mobileAvailable": true, "menuPath": "근태관리>시차출퇴근" }
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    // 정렬 순서 (카테고리 내 노출 우선순위)
    sortOrder: integer("sort_order").default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceTypeIdx: index("idx_directory_entry_workspace_type").on(
      table.workspaceId,
      table.entryType,
    ),
    workspaceCategoryIdx: index("idx_directory_entry_workspace_category").on(
      table.workspaceId,
      table.category,
    ),
    // 이름 검색 인덱스 (ILIKE 패턴 매칭)
    nameIdx: index("idx_directory_entry_name").on(table.name),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const directoryEntryRelations = relations(directoryEntry, ({ one }) => ({
  workspace: one(workspace, {
    fields: [directoryEntry.workspaceId],
    references: [workspace.id],
  }),
}));
