import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { eq, desc } from 'drizzle-orm';

export interface CompileJobData {
  pageId: string;
}

/**
 * Strips common Markdown/MDX syntax to produce a plain-text summary.
 */
function stripMarkdown(mdx: string): string {
  return mdx
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code / code blocks
    .replace(/^```[\s\S]*?```/gm, '') // fenced code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/^[-*+]\s+/gm, '') // list items
    .replace(/^\d+\.\s+/gm, '') // ordered list items
    .replace(/\n{2,}/g, '\n\n') // collapse excess blank lines
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
  const { pageId } = job.data;
  console.log(`[compile] Starting job for pageId=${pageId}`);

  // Fetch knowledge_page
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(eq(knowledgePage.id, pageId))
    .limit(1);

  if (!page) {
    throw new Error(`knowledge_page not found: ${pageId}`);
  }

  // Fetch latest version for summary generation
  const [latestVersion] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  const summary = latestVersion?.mdxContent
    ? stripMarkdown(latestVersion.mdxContent).slice(0, 500)
    : '';

  // Force search_vector refresh — the tsvector update trigger fires on updated_at change.
  // Also store the generated summary.
  await db
    .update(knowledgePage)
    .set({
      summary,
      updatedAt: new Date(),
    })
    .where(eq(knowledgePage.id, pageId));

  console.log(`[compile] Done pageId=${pageId} summary_length=${summary.length}`);
}
