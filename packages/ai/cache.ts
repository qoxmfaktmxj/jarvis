// packages/ai/cache.ts
// Phase-7A PR#5: workspace/prompt/scope-aware LLM response cache.
// Intentionally minimal: in-memory LRU, no Redis. The public API
// (makeCacheKey/getCached/setCached) is stable so Phase-7B can swap
// the storage backend without touching ask.ts.
//
// INTERIM: This LRU store is a Phase-7A only helper. Phase-7B will
// replace it with Redis/pg while keeping the same function signatures.

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

export interface CacheKeyParams {
  /** Bumped manually by prompt authors when a prompt template changes. */
  promptVersion: string;
  /** UUID (lower-case) of the workspace that owns the request. */
  workspaceId: string;
  /**
   * Derived by the caller from the user's access level.
   * Format: "workspace:<uuid>|level:<public|internal|confidential|restricted>"
   * The workspaceId is duplicated here on purpose so level-only changes
   * still alter the key within the same workspace.
   */
  sensitivityScope: string;
  /** The full user-visible input string passed to the LLM. */
  input: string;
  /** Concrete model identifier, e.g. "gpt-5.4-mini". */
  model: string;
}

/**
 * Deterministic SHA-256 hex digest of the canonical JSON representation
 * of the given params. Key order is fixed at serialization time so the
 * hash is stable across runs and Node versions.
 */
export function makeCacheKey(params: CacheKeyParams): string {
  const canonical = JSON.stringify({
    promptVersion: params.promptVersion,
    workspaceId: params.workspaceId,
    sensitivityScope: params.sensitivityScope,
    input: params.input,
    model: params.model,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// In-memory LRU (INTERIM — Phase-7A only)
// ---------------------------------------------------------------------------

const CACHE_CAP = 500;
const store = new Map<string, string>();

export async function getCached(key: string): Promise<string | null> {
  if (!store.has(key)) return null;
  // Touch: move to newest slot so LRU ordering stays correct.
  const value = store.get(key) as string;
  store.delete(key);
  store.set(key, value);
  return value;
}

export async function setCached(key: string, value: string): Promise<void> {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  while (store.size > CACHE_CAP) {
    // Map preserves insertion order; the first key is the oldest.
    const oldest = store.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Test-only: reset the cache between runs. Not exported from package index. */
export function __resetCacheForTests(): void {
  store.clear();
}
