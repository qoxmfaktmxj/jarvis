import { customType, index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// pgvector(1536) — packages/db/schema/knowledge.ts:20-24에 정의된 패턴을 재사용.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`,
});

/**
 * 임베딩 캐시 (Redis 제거 후 PG로 이관).
 * Key: sha256(text) hex.
 * TTL은 `expires_at` 컬럼으로 관리, cache-cleanup cron이 만료된 로우 삭제.
 */
export const embedCache = pgTable(
  "embed_cache",
  {
    hash: varchar("hash", { length: 64 }).primaryKey(),
    embedding: vector("embedding").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresAtIdx: index("idx_embed_cache_expires_at").on(t.expiresAt),
  }),
);
