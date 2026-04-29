import { describe, it, expect, vi } from 'vitest';

// Mock OpenAI to avoid requiring OPENAI_API_KEY at module load time
vi.mock('openai', () => {
  class OpenAI {
    chat = { completions: { create: vi.fn() } };
  }
  return { default: OpenAI };
});

// Mock dependencies that are not needed for pure rrfMerge tests
vi.mock('../agent/ask-agent.js', () => ({ askAgentStream: vi.fn() }));
vi.mock('../agent/sse-adapter.js', () => ({ askAgentToSSE: vi.fn() }));
vi.mock('../logger.js', () => ({ logLlmCall: vi.fn() }));
vi.mock('../budget.js', () => ({
  assertBudget: vi.fn(),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn(),
}));
vi.mock('../cache.js', () => ({ makeCacheKey: vi.fn(), getCached: vi.fn(), setCached: vi.fn() }));

import { rrfMerge } from '../ask.js';

describe('rrfMerge', () => {
  it('item in both lists ranks higher', () => {
    const result = rrfMerge(['a', 'b', 'c'], ['c', 'd', 'e']);
    expect(result[0]!.id).toBe('c');
  });

  it('empty inputs return empty', () => {
    expect(rrfMerge([], [])).toEqual([]);
  });

  it('single list preserves order', () => {
    const result = rrfMerge(['x', 'y'], []);
    expect(result[0]!.id).toBe('x');
    expect(result[0]!.score).toBeCloseTo(1 / 60);
  });
});
