import { describe, it, expect, vi } from 'vitest';

// Mock OpenAI to avoid requiring OPENAI_API_KEY at module load time
vi.mock('openai', () => {
  class OpenAI {
    chat = { completions: { create: vi.fn() } };
  }
  return { default: OpenAI };
});

// Mock heavy dependencies that are not needed for pure rrfMerge tests
vi.mock('@jarvis/db/client', () => ({ db: {} }));
// 레거시 경로 테스트용 — 프로덕션 기본값은 true
vi.mock('@jarvis/db/feature-flags', () => ({
  featurePageFirstQuery: () => false,
}));
vi.mock('../embed.js', () => ({ generateEmbedding: vi.fn() }));
vi.mock('../logger.js', () => ({ logLlmCall: vi.fn() }));
vi.mock('../budget.js', () => ({
  assertBudget: vi.fn(),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn(),
}));
vi.mock('../graph-context.js', () => ({ retrieveRelevantGraphContext: vi.fn(), toGraphSourceRefs: vi.fn() }));
vi.mock('../case-context.js', () => ({ retrieveRelevantCases: vi.fn(), toCaseSourceRef: vi.fn() }));
vi.mock('../directory-context.js', () => ({ searchDirectory: vi.fn(), toDirectorySourceRef: vi.fn() }));
vi.mock('../router.js', () => ({ routeQuestion: vi.fn(), LANE_SOURCE_WEIGHTS: {} }));
vi.mock('../cache.js', () => ({ makeCacheKey: vi.fn(), getCached: vi.fn(), setCached: vi.fn() }));
vi.mock('@jarvis/auth/rbac', () => ({ buildKnowledgeSensitivitySqlFilter: () => '' }));

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
