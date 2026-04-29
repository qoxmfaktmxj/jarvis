// packages/ai/ask.test.ts
// 2026-04-29: legacy snapshotId→retrieveRelevantGraphContext propagation tests
// removed with _legacyAskAI_unused. askAI() now unconditionally delegates to
// the tool-use agent path (askAgentStream). Agent integration coverage is in
// packages/ai/agent/__tests__/.

import { describe, it, expect, vi } from 'vitest';
import { askAI } from './ask.js';

vi.mock('./agent/ask-agent.js', () => ({
  askAgentStream: vi.fn(async function* () {
    // no-op: minimal stub so askAgentToSSE doesn't blow up
  }),
}));

vi.mock('./agent/sse-adapter.js', () => ({
  askAgentToSSE: vi.fn(async function* () {
    yield { type: 'text', content: 'agent answer' };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 5 };
  }),
}));

vi.mock('./budget.js', () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./logger.js', () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./cache.js', () => ({
  makeCacheKey: vi.fn().mockReturnValue('test-key'),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

describe('askAI() — agent path (Phase B3+)', () => {
  it('delegates to askAgentToSSE and yields agent events', async () => {
    const events: unknown[] = [];
    for await (const evt of askAI({
      question: 'test query',
      workspaceId: 'ws-test',
      userId: 'u1',
      userRoles: ['MEMBER'],
      userPermissions: ['knowledge:read'],
    })) {
      events.push(evt);
    }

    expect(events).toContainEqual({ type: 'text', content: 'agent answer' });
    expect(events).toContainEqual({ type: 'done', totalTokens: 5 });
  });
});
