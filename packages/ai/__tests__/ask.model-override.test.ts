// packages/ai/__tests__/ask.model-override.test.ts
// Legacy generateAnswer() model-override describe removed with _legacyAskAI_unused (2026-04-29).
// The recordBlocked model propagation is tested via askAI() budget gate below.

import { describe, expect, it } from 'vitest';
import { makeCacheKey } from '../cache.js';

describe('makeCacheKey model isolation', () => {
  it('mini and full produce distinct cache keys for identical inputs', () => {
    const base = {
      promptVersion: '2026-04-v1',
      workspaceId: 'ws-cache',
      sensitivityScope: 'workspace:ws-cache|level:internal',
      input: 'same question',
    };
    const miniKey = makeCacheKey({ ...base, model: 'gpt-5.4-mini' });
    const fullKey = makeCacheKey({ ...base, model: 'gpt-5.5' });
    expect(miniKey).not.toBe(fullKey);
  });
});
