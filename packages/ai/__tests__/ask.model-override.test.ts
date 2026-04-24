// packages/ai/__tests__/ask.model-override.test.ts
// 2026-04-21 — Verifies per-message model override in askAI() legacy path.
// Two invariants:
//   1. logLlmCall receives the model passed via query.model (not env default)
//   2. makeCacheKey separates mini vs full (cache isolation)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCacheForTests, makeCacheKey } from '../cache.js';

// --- Module mocks -----------------------------------------------------------
const { logLlmCallMock, recordBlockedMock, assertBudgetMock, mockCreate } = vi.hoisted(() => ({
  logLlmCallMock: vi.fn().mockResolvedValue(undefined),
  recordBlockedMock: vi.fn().mockResolvedValue(undefined),
  assertBudgetMock: vi.fn().mockResolvedValue(undefined),
  mockCreate: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn() }) },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock('../budget.js', () => ({
  assertBudget: assertBudgetMock,
  BudgetExceededError: class extends Error {},
  recordBlocked: recordBlockedMock,
}));

vi.mock('../embed.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock('@jarvis/auth/rbac', () => ({
  buildLegacyKnowledgeSensitivitySqlFilter: vi.fn().mockReturnValue(''),
}));

// Legacy path (not page-first) so we exercise generateAnswer directly.
vi.mock('@jarvis/db/feature-flags', () => ({
  featurePageFirstQuery: () => false,
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

// Minimal OpenAI-stream mock (via openai-compat) — emits one text chunk + usage.
function fakeStream(text: string) {
  const chunks = [
    { choices: [{ delta: { content: text } }], usage: null },
    { choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 3 } },
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

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

// Drain async generator into an array.
async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const baseQuery = {
  question: '모델 오버라이드 테스트',
  workspaceId: 'ws-model-override',
  userId: 'u1',
  userRoles: ['MEMBER'] as string[],
  userPermissions: ['knowledge:read'],
  sensitivityScope: 'workspace:ws-model-override|level:internal',
};

// TODO(Phase B3 follow-up): This describe block directly tests generateAnswer()
// (legacy 6-lane path). After Phase B3, askAI delegates to ask-agent and no longer
// calls generateAnswer. The logLlmCall invocation shape also changed (no per-step
// prompt/completion token split). Skipped — delete with _legacyAskAI_unused.
describe.skip('askAI() query.model override (legacy — skipped after Phase B3)', () => {
  beforeEach(() => {
    __resetCacheForTests();
    logLlmCallMock.mockClear();
    recordBlockedMock.mockClear();
    mockCreate.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    __resetCacheForTests();
  });

  it('propagates query.model="gpt-5.4" to logLlmCall', async () => {
    mockCreate.mockResolvedValue(fakeStream('ok'));

    const { askAI } = await import('../ask.js');
    // No retrieval results → fallback path, but generateAnswer is still called
    // only when at least one source exists. To exercise logLlmCall we need the
    // fallback guard to pass; we short-circuit by mocking retrieval to return
    // one claim. For simplicity we route through the "no results" fallback
    // which yields a static text and does NOT call logLlmCall. Instead test
    // generateAnswer directly.
    // Directly verify the generateAnswer path:
    const { generateAnswer } = await import('../ask.js');
    await drain(generateAnswer(
      'q',
      '<context/>',
      [],
      [],
      [],
      [],
      'gpt-5.4',
      { workspaceId: 'ws-test', requestId: 'req-1' },
    ));

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    expect(row.model).toBe('gpt-5.4');

    // askAI used too (coverage) — this is the legacy "no results" branch
    // which doesn't reach generateAnswer, so mockCreate is still just once.
    await drain(askAI({ ...baseQuery, model: 'gpt-5.4' }));
    // mockCreate call count unchanged (fallback path did not hit OpenAI).
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('passes env-default model to logLlmCall when query.model is undefined', async () => {
    const { generateAnswer } = await import('../ask.js');
    await drain(generateAnswer(
      'q',
      '<context/>',
      [],
      [],
      [],
      [],
      // default (= ASK_MODEL = env fallback gpt-5.4-mini)
      undefined as unknown as string,
      { workspaceId: 'ws-test', requestId: 'req-2' },
    ));
    const row = logLlmCallMock.mock.calls[0]![0];
    // Env default is gpt-5.4-mini in test env.
    expect(row.model).toBe(process.env['ASK_AI_MODEL'] ?? 'gpt-5.4-mini');
  });

  it('recordBlocked uses resolved model when budget exceeded', async () => {
    // Force budget gate to throw.
    const { BudgetExceededError } = await import('../budget.js');
    assertBudgetMock.mockRejectedValueOnce(new BudgetExceededError('ws-test', 100, 50));

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery, model: 'gpt-5.4' }));

    expect(recordBlockedMock).toHaveBeenCalledTimes(1);
    const [, modelArg] = recordBlockedMock.mock.calls[0]!;
    expect(modelArg).toBe('gpt-5.4');
  });
});

describe('makeCacheKey model isolation', () => {
  it('mini and full produce distinct cache keys for identical inputs', () => {
    const base = {
      promptVersion: '2026-04-v1',
      workspaceId: 'ws-cache',
      sensitivityScope: 'workspace:ws-cache|level:internal',
      input: 'same question',
    };
    const miniKey = makeCacheKey({ ...base, model: 'gpt-5.4-mini' });
    const fullKey = makeCacheKey({ ...base, model: 'gpt-5.4' });
    expect(miniKey).not.toBe(fullKey);
  });
});
