// packages/ai/embed.ts
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { getRedis } from '@jarvis/db/redis';
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError, recordBlocked } from './budget.js';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const CACHE_TTL_SECONDS = 86400;
const EMBED_PRICE_PER_1K_IN = 0.00002;

function embedCacheKey(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return `embed:${hash}`;
}

function computeCostUsd(tokensIn: number): string {
  return ((tokensIn * EMBED_PRICE_PER_1K_IN) / 1000).toFixed(6);
}

export interface EmbedMeta {
  workspaceId: string;
  requestId?: string | null;
}

const DEFAULT_META: Required<EmbedMeta> = {
  workspaceId: '00000000-0000-0000-0000-000000000000',
  requestId: null,
};

export async function generateEmbedding(
  text: string,
  meta: EmbedMeta = DEFAULT_META,
): Promise<number[]> {
  const redis = getRedis();
  const cacheKey = embedCacheKey(text);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  const startedAt = Date.now();
  const workspaceId = meta.workspaceId;
  const requestId = meta.requestId ?? null;

  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(workspaceId, EMBED_MODEL, requestId);
    }
    throw err;
  }

  try {
    const response = await getOpenAI().embeddings.create({
      model: EMBED_MODEL,
      input: text.trim(),
      dimensions: EMBED_DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    const tokensIn = response.usage?.prompt_tokens ?? 0;
    await logLlmCall({
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      inputTokens: tokensIn,
      outputTokens: 0,
      costUsd: computeCostUsd(tokensIn),
      durationMs: Date.now() - startedAt,
      status: 'ok',
      blockedBy: null,
      errorCode: null,
    });

    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', CACHE_TTL_SECONDS);
    return embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logLlmCall({
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: '0',
      durationMs: Date.now() - startedAt,
      status: 'error',
      blockedBy: null,
      errorCode: message,
    });
    throw err;
  }
}
