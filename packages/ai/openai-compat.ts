// packages/ai/openai-compat.ts
// Model-agnostic token limit param helper.
//
// OpenAI reasoning models (gpt-5.x, o1, o3, o4) require `max_completion_tokens`
// and reject `max_tokens` with 400. Older models (gpt-4, gpt-3.5) only accept
// `max_tokens`. Some transitional models accept both.
//
// Strategy: try `max_completion_tokens` first, and on a 400 that mentions
// `max_tokens`, fall back to `max_tokens`. Result is cached per model to avoid
// re-paying the 400 on every call.

import type OpenAI from 'openai';

type TokenParamShape =
  | { max_completion_tokens: number; max_tokens?: never }
  | { max_tokens: number; max_completion_tokens?: never };

// Cache per-model fallback decision. undefined = unknown, true = use max_tokens.
const preferMaxTokens = new Map<string, boolean>();

export function buildTokenParam(model: string, limit: number): TokenParamShape {
  if (preferMaxTokens.get(model)) {
    return { max_tokens: limit };
  }
  return { max_completion_tokens: limit };
}

function isMaxTokensParamError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: unknown };
  if (e.status !== 400) return false;
  const msg = typeof e.message === 'string' ? e.message : '';
  return /max_tokens|max_completion_tokens/.test(msg);
}

/**
 * Wrap any chat.completions.create call so that a 400 on the token-limit param
 * transparently retries with the other shape. Use for both streaming and
 * non-streaming calls.
 */
export async function createChatWithTokenFallback<
  T,
  P extends Record<string, unknown>,
>(
  openai: OpenAI,
  model: string,
  baseParams: P,
  limit: number,
): Promise<T> {
  const client = openai.chat.completions as unknown as {
    create: (params: Record<string, unknown>) => Promise<T>;
  };
  try {
    return await client.create({
      ...baseParams,
      model,
      ...buildTokenParam(model, limit),
    });
  } catch (err) {
    if (isMaxTokensParamError(err) && !preferMaxTokens.get(model)) {
      // Mark this model as legacy and retry with max_tokens.
      preferMaxTokens.set(model, true);
      return client.create({
        ...baseParams,
        model,
        max_tokens: limit,
      });
    }
    throw err;
  }
}
