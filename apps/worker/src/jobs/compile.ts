// apps/worker/src/jobs/compile.ts

import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { eq, desc } from 'drizzle-orm';

export interface CompileJobData {
  pageId: string;
  skipEmbed?: boolean; // Skip embed chain (e.g. in tests)
}

function stripMarkdown(mdx: string): string {
  return mdx
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^```[\s\S]*?```/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

export async function compileHandler(
  jobs: PgBoss.Job<CompileJobData>[],
): Promise<void> {
  for (const job of jobs) {
    await processCompile(job);
  }
}

async function processCompile(
  job: PgBoss.Job<CompileJobData>,
): Promise<void> {
  const { pageId, skipEmbed } = job.data;
  console.log(`[compile] Starting job for pageId=${pageId}`);

  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(eq(knowledgePage.id, pageId))
    .limit(1);

  if (!page) {
    throw new Error(`knowledge_page not found: ${pageId}`);
  }

  const [latestVersion] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  const summary = latestVersion?.mdxContent
    ? stripMarkdown(latestVersion.mdxContent).slice(0, 500)
    : '';

  await db
    .update(knowledgePage)
    .set({
      summary,
      updatedAt: new Date(),
    })
    .where(eq(knowledgePage.id, pageId));

  console.log(`[compile] Done pageId=${pageId} summary_length=${summary.length}`);

  // Chain: enqueue embed job so the page becomes vector-searchable
  if (!skipEmbed && latestVersion?.mdxContent) {
    const { boss } = await import('../lib/boss.js');
    await boss.send('embed', { pageId });
    console.log(`[compile] Enqueued embed job for pageId=${pageId}`);
  }
}
