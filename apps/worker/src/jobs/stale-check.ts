import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { auditLog } from '@jarvis/db/schema/audit';
import { sql, and, eq } from 'drizzle-orm';

export async function staleCheckHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
): Promise<void> {
  console.log('[stale-check] Starting scheduled stale page check');

  // Find pages where last_verified_at + freshness_sla_days < now() and publish_status = 'published'
  // Or pages that have never been verified and were created more than freshness_sla_days ago
  const stalePages = await db
    .select({ id: knowledgePage.id, title: knowledgePage.title, workspaceId: knowledgePage.workspaceId })
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.publishStatus, 'published'),
        sql`(
          (${knowledgePage.lastVerifiedAt} IS NOT NULL AND
           ${knowledgePage.lastVerifiedAt} + (${knowledgePage.freshnessSlaDays} || ' days')::interval < now())
          OR
          (${knowledgePage.lastVerifiedAt} IS NULL AND
           ${knowledgePage.createdAt} + (${knowledgePage.freshnessSlaDays} || ' days')::interval < now())
        )`,
      ),
    );

  if (stalePages.length === 0) {
    console.log('[stale-check] No stale pages found');
    return;
  }

  console.log(`[stale-check] Found ${stalePages.length} stale pages`);

  // Insert audit_log entries for each stale page
  const auditEntries = stalePages.map((page) => ({
    workspaceId: page.workspaceId,
    action: 'page.stale',
    resourceType: 'knowledge_page',
    resourceId: page.id,
    details: { title: page.title } as Record<string, unknown>,
  }));

  await db.insert(auditLog).values(auditEntries);

  console.log(`[stale-check] Inserted ${auditEntries.length} audit_log entries`);
}
