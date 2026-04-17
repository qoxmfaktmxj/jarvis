// apps/web/lib/server/search-embedder.ts
// Phase-W5: shared OpenAI text-embedding-3-small query embedder for Lane A
// hybrid search. Instantiated once per process; stateless after that.
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Returns the query's 1536d embedding. The caller decides whether to use it —
 * `PgSearchAdapter` only invokes this when `FEATURE_SEARCH_HYBRID=true`.
 */
export async function embedSearchQuery(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const first = res.data[0];
  if (!first) {
    throw new Error('[search] OpenAI returned empty embedding data');
  }
  return first.embedding;
}
