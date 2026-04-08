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

  // Embed all chunks first (outside the transaction — OpenAI calls can be slow/fail)
  const allRows: { pageId: string; chunkIndex: number; claimText: string; embedding: number[] | undefined }[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batchChunks);
    for (let j = 0; j < batchChunks.length; j++) {
      allRows.push({ pageId, chunkIndex: i + j, claimText: batchChunks[j]!, embedding: embeddings[j] });
    }
    console.log(`[embed] Embedded batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchChunks.length} chunks)`);
  }

  // Atomic swap: delete old claims + insert new ones in a single transaction.
  // If insert fails, old claims are preserved (no partial state).
  await db.transaction(async (tx) => {
    await tx.delete(knowledgeClaim).where(eq(knowledgeClaim.pageId, pageId));

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      await tx.insert(knowledgeClaim).values(allRows.slice(i, i + BATCH_SIZE));
    }

    await tx
      .update(knowledgePage)
      .set({ updatedAt: new Date() })
      .where(eq(knowledgePage.id, pageId));
  });

  console.log(`[embed] Done pageId=${pageId} total_claims=${chunks.length}`);
}
