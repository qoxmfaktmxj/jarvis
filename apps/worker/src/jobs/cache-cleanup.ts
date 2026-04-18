// apps/worker/src/jobs/cache-cleanup.ts
// 6시간마다 만료 세션·embed_cache 로우 청소.
import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';

export async function cacheCleanupHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
): Promise<void> {
  console.log('[cache-cleanup] Starting');

  const sessRes = await db.execute(sql`DELETE FROM user_session WHERE expires_at < NOW()`);
  const sessCount = (sessRes as { rowCount?: number }).rowCount ?? 0;
  console.log(`[cache-cleanup] Deleted ${sessCount} expired user_session rows`);

  const embedRes = await db.execute(sql`DELETE FROM embed_cache WHERE expires_at < NOW()`);
  const embedCount = (embedRes as { rowCount?: number }).rowCount ?? 0;
  console.log(`[cache-cleanup] Deleted ${embedCount} expired embed_cache rows`);
}
