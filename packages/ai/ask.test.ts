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

// P1 #2 — Ask cache ACL leak guard.
// askAI()가 permissionFingerprint(=정렬된 perm 문자열)를 cache key 빌더에 항상
// 넘겨야 한다. 같은 sensitivityScope 안에서도 permission profile 이 다른 두 사용자가
// 캐시를 공유하지 않도록.
describe('askAI() — P1 #2 cache key includes permissionFingerprint', () => {
  it('makeCacheKey 가 정렬된 permissions 로 만든 fingerprint 와 함께 호출된다', async () => {
    const cacheModule = await import('./cache.js');
    const makeCacheKeyMock = vi.mocked(cacheModule.makeCacheKey);
    makeCacheKeyMock.mockClear();

    for await (const _ of askAI({
      question: 'q',
      workspaceId: 'ws-test',
      userId: 'u1',
      userRoles: ['MEMBER'],
      // 의도적으로 정렬되지 않은 순서 — askAI 가 sort 해서 fingerprint 만들어야 함
      userPermissions: ['knowledge:update', 'admin:all', 'knowledge:read'],
    })) {
      // drain
    }

    expect(makeCacheKeyMock).toHaveBeenCalledTimes(1);
    const call = makeCacheKeyMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      permissionFingerprint: 'admin:all,knowledge:read,knowledge:update',
    });
  });

  it('permission profile 이 다르면 fingerprint 도 다르게 전달된다', async () => {
    const cacheModule = await import('./cache.js');
    const makeCacheKeyMock = vi.mocked(cacheModule.makeCacheKey);
    makeCacheKeyMock.mockClear();

    for await (const _ of askAI({
      question: 'q',
      workspaceId: 'ws-test',
      userId: 'u1',
      userRoles: ['MEMBER'],
      userPermissions: ['knowledge:read'],
    })) { /* drain */ }
    for await (const _ of askAI({
      question: 'q',
      workspaceId: 'ws-test',
      userId: 'u2',
      userRoles: ['MEMBER'],
      userPermissions: ['knowledge:read', 'wiki:restricted_read'],
    })) { /* drain */ }

    expect(makeCacheKeyMock).toHaveBeenCalledTimes(2);
    const fp1 = (makeCacheKeyMock.mock.calls[0]?.[0] as { permissionFingerprint: string })
      .permissionFingerprint;
    const fp2 = (makeCacheKeyMock.mock.calls[1]?.[0] as { permissionFingerprint: string })
      .permissionFingerprint;
    expect(fp1).not.toBe(fp2);
  });
});
