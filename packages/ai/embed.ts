// packages/ai/embed.ts
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { getRedis } from '@jarvis/db/redis';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const CACHE_TTL_SECONDS = 86400; // 24 hours

function embedCacheKey(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return `embed:${hash}`;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const redis = getRedis();
  const cacheKey = embedCacheKey(text);

  // Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  // Generate embedding via OpenAI
  const response = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: text.trim(),
    dimensions: EMBED_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('No embedding returned from OpenAI');
  }

  // Cache with 24h TTL
  await redis.set(cacheKey, JSON.stringify(embedding), 'EX', CACHE_TTL_SECONDS);

  return embedding;
}
