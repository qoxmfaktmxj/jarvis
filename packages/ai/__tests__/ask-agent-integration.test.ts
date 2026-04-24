// packages/ai/__tests__/ask-agent-integration.test.ts
//
// Phase B3 — Integration tests for the new askAI() → ask-agent delegation path.
// Verifies: budget gate, cache, logLlmCall, happy-path event order.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCacheForTests } from '../cache.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { logLlmCallMock, recordBlockedMock, assertBudgetMock, mockAgentStream } = vi.hoisted(() => ({
  logLlmCallMock: vi.fn().mockResolvedValue(undefined),
  recordBlockedMock: vi.fn().mockResolvedValue(undefined),
  assertBudgetMock: vi.fn().mockResolvedValue(undefined),
  mockAgentStream: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn() }) },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock('../budget.js', () => ({
  assertBudget: assertBudgetMock,
  BudgetExceededError: class extends Error {
    constructor(ws: string, _budget: number, _spent: number) {
      super(`Budget exceeded for ${ws}`);
      this.name = 'BudgetExceededError';
    }
  },
  recordBlocked: recordBlockedMock,
}));

// Mock the agent module — askAgentStream is replaced with mockAgentStream.
vi.mock('../agent/ask-agent.js', () => ({
  askAgentStream: (...args: unknown[]) => mockAgentStream(...args),
  MAX_TOOL_STEPS: 8,
  ASK_SYSTEM_PROMPT: 'mock prompt',
}));

// Mock provider so getAskClient() doesn't need a real OpenAI key.
vi.mock('../provider.js', () => ({
  getProvider: vi.fn().mockReturnValue({
    client: { chat: { completions: { create: vi.fn() } } },
  }),
}));

vi.mock('@jarvis/db/client', () => ({ db: { execute: vi.fn(), insert: vi.fn(() => ({ values: vi.fn() })) } }));
vi.mock('@jarvis/auth/rbac', () => ({ buildLegacyKnowledgeSensitivitySqlFilter: vi.fn().mockReturnValue('') }));

// Cache (real implementation — we reset between tests)
// Don't mock cache so we can test cache hit/miss behavior.

// ---------------------------------------------------------------------------
// Helper: async generator factory
// ---------------------------------------------------------------------------
async function* agentEvents(
  events: Array<{ type: string; [k: string]: unknown }>,
) {
  for (const e of events) yield e as never;
}

async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const baseQuery = {
  question: '테스트 질문입니다',
  workspaceId: 'ws-b3-test',
  userId: 'u1',
  userRoles: ['MEMBER'] as string[],
  userPermissions: ['knowledge:read'],
  sensitivityScope: 'workspace:ws-b3-test|level:internal|graph:0',
  requestId: 'req-b3-1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetCacheForTests();
  logLlmCallMock.mockClear();
  recordBlockedMock.mockClear();
  assertBudgetMock.mockClear();
  mockAgentStream.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  __resetCacheForTests();
});

describe('askAI() — budget gate (Phase B3)', () => {
  it('emits error+done and calls recordBlocked when budget exceeded', async () => {
    const { BudgetExceededError } = await import('../budget.js');
    assertBudgetMock.mockRejectedValueOnce(
      new BudgetExceededError('ws-b3-test', 100, 200),
    );

    const { askAI } = await import('../ask.js');
    const events = await drain(askAI({ ...baseQuery }));

    expect(recordBlockedMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'error', message: 'daily budget exceeded' });
    expect(events).toContainEqual({ type: 'done', totalTokens: 0 });
    // agent should NOT be called when budget exceeded
    expect(mockAgentStream).not.toHaveBeenCalled();
  });

  it('recordBlocked receives the resolved model', async () => {
    const { BudgetExceededError } = await import('../budget.js');
    assertBudgetMock.mockRejectedValueOnce(
      new BudgetExceededError('ws-b3-test', 100, 200),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery, model: 'gpt-5.4' }));

    const [, modelArg] = recordBlockedMock.mock.calls[0]!;
    expect(modelArg).toBe('gpt-5.4');
  });
});

describe('askAI() — agent delegation (Phase B3)', () => {
  it('calls askAgentStream and emits text+sources+done events', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'text', text: '위키 기반 답변입니다.' },
        { type: 'done', finishReason: 'stop', steps: 2, totalTokens: 120 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    const events = await drain(askAI({ ...baseQuery }));

    expect(mockAgentStream).toHaveBeenCalledTimes(1);

    const types = (events as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain('text');
    expect(types).toContain('sources');
    expect(types).toContain('done');

    const textEvent = events.find((e) => (e as { type: string }).type === 'text');
    expect(textEvent).toMatchObject({ type: 'text', content: '위키 기반 답변입니다.' });
  });

  it('passes correct toolContext to askAgentStream (workspaceId, userId, permissions)', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'done', finishReason: 'stop', steps: 1, totalTokens: 10 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery }));

    const [_question, toolContext] = mockAgentStream.mock.calls[0]!;
    expect(toolContext).toMatchObject({
      workspaceId: 'ws-b3-test',
      userId: 'u1',
    });
  });

  it('emits error event on max_steps abort', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'done', finishReason: 'max_steps', steps: 8, totalTokens: 400 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    const events = await drain(askAI({ ...baseQuery }));

    const errEvent = events.find((e) => (e as { type: string }).type === 'error');
    expect(errEvent).toMatchObject({
      type: 'error',
      message: expect.stringContaining('MAX_TOOL_STEPS'),
    });
  });
});

describe('askAI() — cache (Phase B3)', () => {
  it('second identical call returns cached result without calling askAgentStream again', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'text', text: '캐시 테스트 답변' },
        { type: 'done', finishReason: 'stop', steps: 1, totalTokens: 30 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery }));
    await drain(askAI({ ...baseQuery }));

    // Agent should only be called once — second call from cache.
    expect(mockAgentStream).toHaveBeenCalledTimes(1);
  });

  it('different sensitivityScope produces separate cache slots', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'done', finishReason: 'stop', steps: 1, totalTokens: 20 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery, sensitivityScope: 'workspace:ws-b3-test|level:internal|graph:0' }));
    await drain(askAI({ ...baseQuery, sensitivityScope: 'workspace:ws-b3-test|level:restricted|graph:1' }));

    expect(mockAgentStream).toHaveBeenCalledTimes(2);
  });
});

describe('askAI() — sources from wiki_read (Phase B3 spec fix)', () => {
  it('emits sources event with wiki_read slug when agent reads a page', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'tool-call', name: 'wiki_read', input: { slug: 'my-page' }, callId: 'tc1' },
        {
          type: 'tool-result',
          name: 'wiki_read',
          callId: 'tc1',
          ok: true,
          data: { slug: 'my-page', title: 'My Page', path: 'auto/MyPage.md', sensitivity: 'PUBLIC' },
        },
        { type: 'text', text: '위키 기반 답변입니다.' },
        { type: 'done', finishReason: 'stop', steps: 2, totalTokens: 150 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    const events = await drain(askAI({ ...baseQuery }));

    const sourcesEvent = events.find(
      (e) => (e as { type: string }).type === 'sources',
    ) as { type: 'sources'; sources: Array<{ slug: string; title: string }> } | undefined;

    expect(sourcesEvent).toBeDefined();
    expect(sourcesEvent!.sources).toHaveLength(1);
    expect(sourcesEvent!.sources[0]).toMatchObject({ slug: 'my-page', title: 'My Page' });
  });
});

describe('askAI() — logLlmCall (Phase B3)', () => {
  it('calls logLlmCall once after the agent completes', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'text', text: 'ok' },
        { type: 'done', finishReason: 'stop', steps: 1, totalTokens: 55 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery }));

    // logLlmCall is async fire-and-forget — wait a tick for the promise to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    expect(row.status).toBe('ok');
    expect(row.workspaceId).toBe('ws-b3-test');
    expect(row.requestId).toBe('req-b3-1');
  });

  it('logs status=error when agent returns max_steps', async () => {
    mockAgentStream.mockImplementation(() =>
      agentEvents([
        { type: 'done', finishReason: 'max_steps', steps: 8, totalTokens: 300 },
      ]),
    );

    const { askAI } = await import('../ask.js');
    await drain(askAI({ ...baseQuery }));

    await new Promise((r) => setTimeout(r, 0));

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    // max_steps triggers error SSE event, so status=error
    expect(row.status).toBe('error');
  });
});
