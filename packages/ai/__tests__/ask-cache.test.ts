// packages/ai/__tests__/ask-cache.test.ts
// Phase-7A PR#5 TDD: verifies cache-through behaviour in askAI().
// Two cases:
//   1. second identical call returns cached result without a second OpenAI call
//   2. different workspaceId → different cache slot → 2 OpenAI calls

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCacheForTests } from '../cache.js';

// ---------------------------------------------------------------------------
// Module mocks — must be at the top level so vitest hoists them.
// ---------------------------------------------------------------------------
vi.mock('../embed.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

// Return one claim row + one fts row so retrieval has results (avoids
// the "no results" fallback path that skips OpenAI entirely).
vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

// assertBudget issues its own db.execute call inside askAI. Mock the module
// so the test's mockResolvedValueOnce sequence stays aligned with the
// retrieval queries it actually cares about.
vi.mock('../budget.js', () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@jarvis/auth/rbac', () => ({
  buildKnowledgeSensitivitySqlFilter: vi.fn().mockReturnValue(''),
}));

vi.mock('../graph-context.js', () => ({
  retrieveRelevantGraphContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../case-context.js', () => ({
  retrieveRelevantCases: vi.fn().mockResolvedValue({ cases: [] }),
  toCaseSourceRef: vi.fn((c: unknown) => c),
}));

vi.mock('../directory-context.js', () => ({
  searchDirectory: vi.fn().mockResolvedValue({ entries: [] }),
  toDirectorySourceRef: vi.fn((e: unknown) => e),
}));

// Spy on openai.chat.completions.create — we intercept via the module mock.
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain an async generator, collecting all events. */
async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const evt of gen) {
    events.push(evt);
  }
  return events;
}

/** Minimal async iterable that yields one text chunk then usage. */
function fakeStream(text: string) {
  const chunks = [
    { choices: [{ delta: { content: text } }], usage: null },
    {
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  ];
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < chunks.length) return { value: chunks[i++], done: false };
          return { value: undefined, done: true };
        },
      };
    },
  };
}

// Mock DB rows that look like real knowledge_claim + knowledge_page rows
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vectorRows: any = {
  rows: [
    {
      id: 'c1',
      claim_text: 'Jarvis is an enterprise portal.',
      page_id: 'p1',
      title: 'About Jarvis',
      distance: 0.1,
    },
  ],
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ftsRows: any = {
  rows: [{ page_id: 'p1', fts_rank: 0.8 }],
};

// ---------------------------------------------------------------------------
// Base query fixture
// ---------------------------------------------------------------------------
const baseQuery = {
  question: '동일한 질문',
  workspaceId: 'ws-test-cache',
  userId: 'u1',
  userRoles: ['MEMBER'] as string[],
  userPermissions: ['knowledge:read'],
  sensitivityScope: 'workspace:ws-test-cache|level:internal',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('askAI() cache-through', () => {
  beforeEach(async () => {
    // Reset LRU between tests
    __resetCacheForTests();

    // Mock db queries to return one claim row so retrieval has results
    const { db } = await import('@jarvis/db/client');
    vi.mocked(db.execute)
      .mockResolvedValueOnce(vectorRows)
      .mockResolvedValueOnce(ftsRows)
      .mockResolvedValueOnce(vectorRows)
      .mockResolvedValueOnce(ftsRows)
      .mockResolvedValueOnce(vectorRows)
      .mockResolvedValueOnce(ftsRows)
      .mockResolvedValueOnce(vectorRows)
      .mockResolvedValueOnce(ftsRows);

    // Default: openai returns a simple answer stream
    mockCreate.mockResolvedValue(fakeStream('cached answer text'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    __resetCacheForTests();
  });

  it('second identical call returns cached result without a second OpenAI invocation', async () => {
    const { askAI } = await import('../ask.js');

    // First call — openAI should be invoked
    await drain(askAI({ ...baseQuery }));
    // Second identical call — should hit cache, NOT invoke OpenAI again
    await drain(askAI({ ...baseQuery }));

    // OpenAI must have been called exactly once across both ask() invocations.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('different workspaceId → different cache slot → 2 OpenAI invocations', async () => {
    const { askAI } = await import('../ask.js');

    await drain(askAI({ ...baseQuery, workspaceId: 'ws-A' }));
    await drain(askAI({ ...baseQuery, workspaceId: 'ws-B' }));

    // Two distinct workspaces → two distinct cache keys → two OpenAI calls.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
