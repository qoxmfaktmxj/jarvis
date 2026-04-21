// packages/ai/openai-compat.ts
// Model-agnostic token limit param helper.
//
// OpenAI reasoning 계열(gpt-5.x 포함)은 `max_completion_tokens`를 요구하고
// `max_tokens`를 400으로 거부한다. 구형 Chat Completions 모델은 `max_tokens`
// 만 받는다. 일부 전환기 모델은 둘 다 받는다. (허용 모델 목록:
// docs/policies/llm-models.md)
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
