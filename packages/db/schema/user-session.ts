import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 서버 세션 스토리지 (Redis 제거 후 PG로 이관).
 * `data`에 `JarvisSession` 전체를 JSONB로 저장한다.
 * (`packages/auth` 쪽에서 읽을 때 `JarvisSession`으로 cast; DB 패키지는
 * 도메인 타입을 import하지 않아 워크스페이스 사이클을 피한다.)
 */
export const userSession = pgTable(
  "user_session",
  {
    id: text("id").primaryKey(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresAtIdx: index("idx_user_session_expires_at").on(t.expiresAt),
  }),
);
