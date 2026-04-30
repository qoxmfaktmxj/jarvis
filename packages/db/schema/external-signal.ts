import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspace } from "./tenant.js";

/**
 * external_signal — 외부 데이터 소스(환율, 날씨 등) 캐시 테이블.
 *
 * worker가 cron 스케줄(KST 07-19시 매시 + 21·00·03시)로 fetch → upsert.
 * RSC가 read만 함. 새 fetch 시 같은 (workspace_id, kind, key) 조합은 덮어쓰기.
 *
 * - kind='fx': key='KRW' (base currency), payload={ rates, change }
 * - kind='weather': key=`${nx},${ny}`, payload={ temp, hi, lo, sky, pty, dust? }
 */
export const externalSignalKindEnum = pgEnum("external_signal_kind", [
  "fx",
  "weather"
]);

export const externalSignal = pgTable(
  "external_signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: externalSignalKindEnum("kind").notNull(),
    key: text("key").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
  },
  (table) => ({
    wsKindKeyUq: uniqueIndex("uq_external_signal_ws_kind_key").on(
      table.workspaceId,
      table.kind,
      table.key
    )
  })
);

export const externalSignalRelations = relations(
  externalSignal,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [externalSignal.workspaceId],
      references: [workspace.id]
    })
  })
);
