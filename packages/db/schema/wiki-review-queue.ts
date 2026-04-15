import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

/**
 * packages/db/schema/wiki-review-queue.ts
 *
 * Phase-W1 T4 — Wiki 전용 review queue (WIKI-AGENTS.md §7, §3.3, §3.4).
 *
 * **기존 `review_queue`와의 관계**
 * - 기존 `review_queue`(packages/db/schema/review-queue.ts)는 Phase-7A에서 PII/Secret keyword
 *   중심으로 설계되어 `reason` 기반 free-form 분류를 사용한다. 그대로 유지하여 기존 flow 호환.
 * - Wiki 도메인 이벤트(contradictions, lint, heal, sensitivity_promotion, boundary_violation,
 *   synonym_conflict, ingest_fail, integrity_violation)는 **별도 테이블**로 분리해 `kind` enum
 *   필드를 구조적으로 강제한다. 두 큐는 관리자 UI에서 합쳐 보여주되 소스는 분리.
 *
 * **`kind` 허용 값** (WIKI-AGENTS §7 / 99-integration-plan-v4 §5.1 G3):
 *   - `contradiction`            주제 동일·주장 상충 (lint semantic)
 *   - `lint`                     orphan/broken-link/no-outlink/missing-cross-ref 등 통합
 *   - `heal`                     self-heal 제안 (sensitivity 자동 승급 등)
 *   - `sensitivity_promotion`    PII/Secret 감지로 sensitivity 상승 제안
 *   - `boundary_violation`       auto/manual 경계 위반 (W3-T1)
 *   - `synonym_conflict`         aliases 충돌 ("마인드볼트" 함정)
 *   - `ingest_fail`              validate 실패로 ingest_dlq에 들어간 건
 *   - `integrity_violation`      G8 wiki_commit_log ↔ git HEAD 불일치
 *
 * **`status` 값:** `pending | approved | rejected` (기존 `review_queue`와 동일 컨벤션).
 */
export const wikiReviewQueue = pgTable(
  "wiki_review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).notNull(),
    // 관련 페이지 id 배열(선택). contradictions=2+, lint/heal=1+, integrity_violation=N.
    affectedPages: jsonb("affected_pages")
      .$type<string[]>()
      .default([])
      .notNull(),
    // 관련 commitSha (ingest_fail/integrity_violation 등에서 사용)
    commitSha: varchar("commit_sha", { length: 40 }),
    // LLM reasoning 또는 lint rule name 등 자유 텍스트
    description: text("description"),
    // 원본 구조 payload (lint rule 결과 JSON 등)
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    assignedTo: uuid("assigned_to").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => user.id),
  },
  (t) => ({
    wsStatusIdx: index("wiki_review_queue_ws_status_idx").on(
      t.workspaceId,
      t.status,
    ),
    wsKindStatusIdx: index("wiki_review_queue_ws_kind_status_idx").on(
      t.workspaceId,
      t.kind,
      t.status,
    ),
    wsCreatedIdx: index("wiki_review_queue_ws_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

export type WikiReviewQueue = typeof wikiReviewQueue.$inferSelect;
export type NewWikiReviewQueue = typeof wikiReviewQueue.$inferInsert;
