// packages/ai/__tests__/ask-default-path.test.ts
// B4 Phase 2: featurePageFirstQuery 기본값이 true이므로,
// mock 없이 askAI() 호출 시 page-first 경로(pageFirstAsk)로 위임되는지 검증.

import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — pageFirstAsk를 spy로 대체하여 호출 여부만 확인
// ---------------------------------------------------------------------------

const mockPageFirstAsk = vi.fn();

vi.mock('../page-first/index.js', () => ({
  pageFirstAsk: (...args: unknown[]) => mockPageFirstAsk(...args),
}));

// featurePageFirstQuery를 mock하지 않는다.
// 환경변수 FEATURE_PAGE_FIRST_QUERY가 설정되지 않으면 기본값 true가 적용되어
// page-first 경로로 진입해야 한다.

// ask.ts의 나머지 import가 폭발하지 않도록 최소 mock
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));
vi.mock('@jarvis/db/client', () => ({ db: { execute: vi.fn() } }));
vi.mock('../embed.js', () => ({ generateEmbedding: vi.fn() }));
vi.mock('../logger.js', () => ({ logLlmCall: vi.fn() }));
vi.mock('../budget.js', () => ({
  assertBudget: vi.fn(),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn(),
}));
vi.mock('../graph-context.js', () => ({
  retrieveRelevantGraphContext: vi.fn(),
}));
vi.mock('../case-context.js', () => ({
  retrieveRelevantCases: vi.fn(),
  toCaseSourceRef: vi.fn(),
}));
vi.mock('../directory-context.js', () => ({
  searchDirectory: vi.fn(),
  toDirectorySourceRef: vi.fn(),
}));
vi.mock('../router.js', () => ({
  routeQuestion: vi.fn(),
  LANE_SOURCE_WEIGHTS: {},
}));
vi.mock('../cache.js', () => ({
  makeCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock('@jarvis/auth/rbac', () => ({
  buildLegacyKnowledgeSensitivitySqlFilter: () => '',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// TODO(Phase B3 follow-up): After Phase B3, askAI no longer checks
// featurePageFirstQuery — it always delegates to ask-agent. Both the
// "page-first" and "legacy" branches in the old askAI are gone.
// These tests should be rewritten for the new agent-based path.
describe.skip('askAI() default path (legacy featurePageFirstQuery — skipped after Phase B3)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // FEATURE_PAGE_FIRST_QUERY가 혹시 설정됐다면 제거
    delete process.env['FEATURE_PAGE_FIRST_QUERY'];
  });

  it('delegates to pageFirstAsk when FEATURE_PAGE_FIRST_QUERY is unset (default=true)', async () => {
    // 환경변수 미설정 상태 보장
    delete process.env['FEATURE_PAGE_FIRST_QUERY'];

    // pageFirstAsk가 최소 SSEEvent를 yield하도록 설정
    mockPageFirstAsk.mockImplementation(async function* () {
      yield { type: 'text', content: 'page-first answer' };
      yield { type: 'done', totalTokens: 10 };
    });

    const { askAI } = await import('../ask.js');

    const events = await drain(
      askAI({
        question: 'test question',
        workspaceId: 'ws-test',
        userId: 'u1',
        userRoles: ['MEMBER'],
        userPermissions: ['knowledge:read'],
      }),
    );

    // pageFirstAsk가 호출되었는지 확인
    expect(mockPageFirstAsk).toHaveBeenCalledTimes(1);
    expect(mockPageFirstAsk).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'test question' }),
    );

    // 이벤트가 pageFirstAsk에서 온 것인지 확인
    expect(events).toContainEqual({ type: 'text', content: 'page-first answer' });
    expect(events).toContainEqual({ type: 'done', totalTokens: 10 });
  });

  it('falls back to legacy path when FEATURE_PAGE_FIRST_QUERY=false', async () => {
    process.env['FEATURE_PAGE_FIRST_QUERY'] = 'false';

    // 이 테스트에서는 legacy 경로가 실행되므로 pageFirstAsk가 호출되지 않아야 함
    // legacy 경로는 DB 조회 등이 필요하지만, 여기서는 pageFirstAsk 미호출만 검증
    const { askAI } = await import('../ask.js');

    // legacy 경로가 에러 없이 진입하는지만 확인 (DB mock이 빈 값이라 에러 발생 가능)
    try {
      await drain(askAI({
        question: 'test question',
        workspaceId: 'ws-test',
        userId: 'u1',
        userRoles: ['MEMBER'],
        userPermissions: ['knowledge:read'],
      }));
    } catch {
      // legacy 경로의 DB mock이 불완전하므로 에러는 무시
    }

    expect(mockPageFirstAsk).not.toHaveBeenCalled();
  });
});
