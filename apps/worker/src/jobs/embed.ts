import type PgBoss from 'pg-boss';
import OpenAI from 'openai';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion, knowledgeClaim } from '@jarvis/db/schema/knowledge';
import { eq, desc } from 'drizzle-orm';
import { chunkText } from '../lib/text-chunker.js';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export interface EmbedJobData {
  pageId: string;
}

const EMBED_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 10;

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

export async function embedHandler(
  jobs: PgBoss.Job<EmbedJobData>[],
): Promise<void> {
  for (const job of jobs) {
    await processEmbed(job);
  }
}

async function processEmbed(
  job: PgBoss.Job<EmbedJobData>,
): Promise<void> {
  const { pageId } = job.data;
  console.log(`[embed] Starting job for pageId=${pageId}`);

  // Fetch knowledge_page
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(eq(knowledgePage.id, pageId))
    .limit(1);

  if (!page) {
    throw new Error(`knowledge_page not found: ${pageId}`);
  }

  // Fetch current version MDX content
  const [latestVersion] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  if (!latestVersion?.mdxContent) {
    console.log(`[embed] No MDX content for pageId=${pageId}, skipping`);
    return;
  }

  const mdxContent = latestVersion.mdxContent;

  // Chunk the content
  const chunks = chunkText(mdxContent, 300, 50);
  console.log(`[embed] pageId=${pageId} chunks=${chunks.length}`);

  // Idempotent: delete existing claims for this page before inserting new ones
  await db.delete(knowledgeClaim).where(eq(knowledgeClaim.pageId, pageId));

  // Embed in batches of BATCH_SIZE to avoid rate limits
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batchChunks);

    const rows = batchChunks.map((chunk, idx) => ({
      pageId,
      chunkIndex: i + idx,
      claimText: chunk,
      embedding: embeddings[idx],
    }));

    await db.insert(knowledgeClaim).values(rows);
    console.log(
      `[embed] Inserted batch ${i / BATCH_SIZE + 1} (${rows.length} claims)`,
    );
  }

  // Touch updated_at to trigger search_vector refresh
  await db
    .update(knowledgePage)
    .set({ updatedAt: new Date() })
    .where(eq(knowledgePage.id, pageId));

  console.log(`[embed] Done pageId=${pageId} total_claims=${chunks.length}`);
}
