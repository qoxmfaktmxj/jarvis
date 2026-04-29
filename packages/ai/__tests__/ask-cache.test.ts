// packages/ai/__tests__/ask-cache.test.ts
// Cache-through behaviour for the agent path is tested in ask-agent-integration.test.ts.
// Legacy 6-lane router cache test removed with _legacyAskAI_unused (2026-04-29).

import { describe, it, expect } from 'vitest';
import { __resetCacheForTests, makeCacheKey } from '../cache.js';

describe('cache key isolation', () => {
  it('different workspaceIds produce distinct keys', () => {
    __resetCacheForTests();
    const base = {
      promptVersion: 'v1',
      workspaceId: 'ws-A',
      sensitivityScope: 'workspace:ws-A|level:internal',
      input: 'same question',
      model: 'gpt-5.4-mini',
    };
    const keyA = makeCacheKey({ ...base, workspaceId: 'ws-A' });
    const keyB = makeCacheKey({ ...base, workspaceId: 'ws-B' });
    expect(keyA).not.toBe(keyB);
  });
});
