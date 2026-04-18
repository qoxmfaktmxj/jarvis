import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { JarvisSession } from "@jarvis/auth/types";

/**
 * 서버 세션 스토리지 (Redis 제거 후 PG로 이관).
 * `data`에 `JarvisSession` 전체를 JSONB로 저장한다.
 */
export const userSession = pgTable(
  "user_session",
  {
    id: text("id").primaryKey(),
    data: jsonb("data").$type<JarvisSession>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresAtIdx: index("idx_user_session_expires_at").on(t.expiresAt),
  }),
);
