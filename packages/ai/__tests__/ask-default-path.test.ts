// packages/ai/__tests__/ask-default-path.test.ts
// 2026-04-29 (Phase B3 cleanup): askAI() unconditionally delegates to the
// tool-use agent. featurePageFirstQuery flag removed. No legacy path exists.

import { describe, it, expect, vi } from 'vitest';

const mockAskAgentToSSE = vi.fn();

vi.mock('../agent/ask-agent.js', () => ({
  askAgentStream: vi.fn(async function* () {}),
}));

vi.mock('../agent/sse-adapter.js', () => ({
  askAgentToSSE: (...args: unknown[]) => mockAskAgentToSSE(...args),
}));

vi.mock('../budget.js', () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../logger.js', () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../cache.js', () => ({
  makeCacheKey: vi.fn().mockReturnValue('key'),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('askAI() — agent is the default (and only) path', () => {
  it('always calls askAgentToSSE regardless of any env flag', async () => {
    mockAskAgentToSSE.mockImplementation(async function* () {
      yield { type: 'text', content: 'agent-only answer' };
      yield { type: 'done', totalTokens: 3 };
    });

    const { askAI } = await import('../ask.js');
    const events = await drain(
      askAI({
        question: 'test',
        workspaceId: 'ws-1',
        userId: 'u1',
        userRoles: ['MEMBER'],
        userPermissions: ['knowledge:read'],
      }),
    );

    expect(mockAskAgentToSSE).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'text', content: 'agent-only answer' });
  });
});
