// packages/ai/ask.ts  (retrieval + generation)
// 2026-04-24 (Phase B3): askAI delegates to ask-agent tool-use loop.
// 2026-04-29: legacy retrieval modules (router/graph-context/page-first) removed
//             — only the tool-use agent path remains.

import OpenAI from 'openai';
import { getProvider } from './provider.js';
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError, recordBlocked } from './budget.js';
import { makeCacheKey, getCached, setCached } from './cache.js';
import { askAgentStream } from './agent/ask-agent.js';
import { askAgentToSSE } from './agent/sse-adapter.js';
import type {
  SSEEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Cache key versioning — bump when prompt template changes
// ---------------------------------------------------------------------------
export const PROMPT_VERSION = '2026-04-v1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ASK_MODEL = process.env['ASK_AI_MODEL'] ?? 'gpt-5.4-mini';

/** Phase-W1 T5: op label for non-wiki retrieval/generation path. */
const ASK_OP = 'ask' as const;

// 모델별 단가(USD per 1K tokens). 스펙 §3 PR#1 cost 계산용.
// Phase-Harness (2026-04-23): embedding 모델 pricing 제거.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'gpt-5.4-mini': { in: 0.0005, out: 0.0015 },
  'gpt-5.5': { in: 0.005, out: 0.015 },
};

function computeCostUsd(model: string, tokensIn: number, tokensOut: number): string {
  const p = MODEL_PRICING[model] ?? { in: 0, out: 0 };
  const cost = (tokensIn * p.in + tokensOut * p.out) / 1000;
  return cost.toFixed(6);
}

// ---------------------------------------------------------------------------
// RRF (Reciprocal Rank Fusion) — hybrid search merge utility
// ---------------------------------------------------------------------------
const RRF_K = 60;

export function rrfMerge(
  listA: string[],
  listB: string[],
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (let i = 0; i < listA.length; i++) {
    const id = listA[i]!;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i));
  }
  for (let i = 0; i < listB.length; i++) {
    const id = listB[i]!;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i));
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// OpenAI Client (lazy — resolved per-call so FEATURE_SUBSCRIPTION_QUERY can
// flip at runtime in tests / pilot toggles without a worker restart).
// ---------------------------------------------------------------------------
function getAskClient(): OpenAI {
  return getProvider('query').client;
}

export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userId, userPermissions } = query;

  // -------------------------------------------------------------------------
  // Cache-through (in-memory LRU; see packages/ai/cache.ts).
  //
  // sensitivityScope encodes clearance + graph access bucket but NOT the
  // user's per-page ACL (e.g. requiredPermission gates). Two users with the
  // same clearance can still see different page-level data, so the cache key
  // must additionally include a deterministic fingerprint of the user's
  // permissions — otherwise a cached answer for user A may surface to user B
  // who lacks one of A's restricted-page permissions (P1 #2).
  // -------------------------------------------------------------------------
  const sensitivityScope =
    query.sensitivityScope ??
    `workspace:${workspaceId}|level:internal|graph:0`;

  // 요청별 모델 오버라이드 — undefined면 env default (ASK_MODEL).
  const resolvedModel = query.model ?? ASK_MODEL;

  // Sorted, comma-joined permission strings — order independent so that
  // user roles producing the same permission set cache as one entry.
  const permissionFingerprint = [...(userPermissions ?? [])].sort().join(',');

  const cacheKey = makeCacheKey({
    promptVersion: PROMPT_VERSION,
    workspaceId,
    sensitivityScope,
    permissionFingerprint,
    input: question,
    model: resolvedModel,
  });

  // Budget gate applies even on cache hit.
  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(workspaceId, resolvedModel, query.requestId ?? null, ASK_OP);
      yield { type: 'error', message: 'daily budget exceeded' };
      yield { type: 'done', totalTokens: 0 };
      return;
    }
    throw err;
  }

  const hit = await getCached(cacheKey);
  if (hit) {
    const cached = JSON.parse(hit) as SSEEvent[];
    for (const evt of cached) {
      yield evt;
    }
    return;
  }

  // No cache hit — run the agent tool-use loop.
  const startedAt = Date.now();
  const client = getAskClient();
  const toolContext = {
    workspaceId,
    userId: userId ?? 'unknown',
    permissions: userPermissions as readonly string[],
  };

  const collectedEvents: SSEEvent[] = [];
  let totalTokens = 0;
  let hasError = false;

  try {
    const agentStream = askAgentStream(question, toolContext, {
      client,
      model: resolvedModel,
    });

    for await (const sseEvent of askAgentToSSE(agentStream, workspaceId)) {
      collectedEvents.push(sseEvent);
      yield sseEvent;

      if (sseEvent.type === 'done') {
        totalTokens = sseEvent.totalTokens;
      }
      if (sseEvent.type === 'error') {
        hasError = true;
      }
    }
  } catch (err) {
    hasError = true;
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다';
    const errEvent: SSEEvent = { type: 'error', message };
    collectedEvents.push(errEvent);
    yield errEvent;
    const doneEvent: SSEEvent = { type: 'done', totalTokens: 0 };
    collectedEvents.push(doneEvent);
    yield doneEvent;
  } finally {
    // logLlmCall — fire-and-forget, don't block the stream.
    // Heuristic 70/30 input/output split: ask-agent accumulates totalTokens
    // across all steps but does not expose per-step prompt/completion breakdown.
    // Using 70% input / 30% output is a conservative approximation until
    // per-step token telemetry is added (tracked as follow-up).
    // MODEL_PRICING keys at top of file drive computeCostUsd.
    const splitIn = Math.round(totalTokens * 0.7);
    const splitOut = totalTokens - splitIn;
    logLlmCall({
      op: ASK_OP,
      workspaceId,
      requestId: query.requestId ?? null,
      model: resolvedModel,
      promptVersion: PROMPT_VERSION,
      inputTokens: splitIn,
      outputTokens: splitOut,
      costUsd: computeCostUsd(resolvedModel, splitIn, splitOut),
      durationMs: Date.now() - startedAt,
      status: hasError ? 'error' : 'ok',
      blockedBy: null,
      errorCode: null,
    }).catch((e) => {
      console.error('[ask] logLlmCall failed:', e instanceof Error ? e.message : e);
    });
  }

  // Cache only successful responses.
  if (!hasError) {
    await setCached(cacheKey, JSON.stringify(collectedEvents));
  }
}

