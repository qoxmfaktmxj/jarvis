// apps/web/lib/server/search-embedder.ts
// Phase-W5: shared OpenAI text-embedding-3-small query embedder for Lane A
// hybrid search. Lazily constructed so module import does not crash in
// environments without OPENAI_API_KEY — the client is only built on the first
// call, which only happens when FEATURE_SEARCH_HYBRID=true.
import OpenAI from 'openai';

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('[search] OPENAI_API_KEY is required for hybrid search');
    }
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Returns the query's 1536d embedding. The caller decides whether to use it —
 * `PgSearchAdapter` only invokes this when `FEATURE_SEARCH_HYBRID=true`.
 */
export async function embedSearchQuery(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const first = res.data[0];
  if (!first) {
    throw new Error('[search] OpenAI returned empty embedding data');
  }
  return first.embedding;
}
