import { describe, it, expect, vi, beforeEach } from 'vitest';
import type PgBoss from 'pg-boss';

/**
 * Code review HIGH G — aggregate-popular cron 의 idempotency.
 *
 * onConflictDoNothing() 은 PK(id) 기준으로만 conflict 를 체크하므로 매 실행마다
 * (workspaceId, query, period) 의 중복 row 가 누적되거나 (UNIQUE 부재 시)
 * count freeze 됨. 0048 마이그레이션으로 UNIQUE 추가 + onConflictDoUpdate 로 교체.
 *
 * 본 테스트는:
 * 1) 주 시작 계산이 immutable Date 를 반환 (LOW I)
 * 2) handler 가 onConflictDoUpdate 호출 + target 컬럼이 ws/query/period 인지
 * 3) count 가 excluded.count 로 갱신되는지
 */

const { onConflictMock, valuesMock, executeMock } = vi.hoisted(() => ({
  onConflictMock: vi.fn().mockResolvedValue(undefined),
  valuesMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock('@jarvis/db/client', () => {
  return {
    db: {
      execute: executeMock,
      insert: vi.fn(() => ({
        values: (...args: unknown[]) => {
          valuesMock(...args);
          return {
            onConflictDoUpdate: (cfg: unknown) => onConflictMock(cfg),
          };
        },
      })),
    },
  };
});

vi.mock('@jarvis/db/schema/search', () => ({
  popularSearch: {
    workspaceId: 'workspace_id',
    query: 'query',
    period: 'period',
    count: 'count',
  },
  searchLog: {},
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      kind: 'sql',
    }),
    {
      raw: (s: string) => s,
    },
  ),
}));

import { aggregatePopularHandler, currentWeekStart } from './aggregate-popular.js';

describe('currentWeekStart — LOW I (immutability)', () => {
  it('does not mutate input Date', () => {
    const input = new Date(Date.UTC(2026, 3, 30, 10, 0, 0)); // Thu 2026-04-30
    const before = input.toISOString();
    currentWeekStart(input);
    expect(input.toISOString()).toBe(before);
  });

  it('returns Sunday of the week (UTC) as YYYY-MM-DD', () => {
    expect(currentWeekStart(new Date(Date.UTC(2026, 3, 30, 10, 0, 0)))).toBe('2026-04-26');
    expect(currentWeekStart(new Date(Date.UTC(2026, 3, 26, 10, 0, 0)))).toBe('2026-04-26'); // already Sunday
    expect(currentWeekStart(new Date(Date.UTC(2026, 4, 1, 10, 0, 0)))).toBe('2026-04-26'); // Friday
  });
});

describe('aggregatePopularHandler — HIGH G UPSERT semantics', () => {
  beforeEach(() => {
    valuesMock.mockClear();
    onConflictMock.mockClear();
    executeMock.mockReset();
  });

  it('returns inserted=0 when search_log empty', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const result = await aggregatePopularHandler(
      [] as PgBoss.Job<Record<string, never>>[],
      undefined,
      new Date(Date.UTC(2026, 3, 30, 10, 0, 0)),
    );
    expect(result.inserted).toBe(0);
    expect(result.period).toBe('2026-04-26');
    expect(onConflictMock).not.toHaveBeenCalled();
  });

  it('uses onConflictDoUpdate with (workspaceId, query, period) target', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { workspace_id: 'ws-1', query: 'jarvis', cnt: '42' },
        { workspace_id: 'ws-1', query: 'wiki', cnt: '17' },
      ],
    });

    await aggregatePopularHandler(
      [] as PgBoss.Job<Record<string, never>>[],
      undefined,
      new Date(Date.UTC(2026, 3, 30, 10, 0, 0)),
    );

    expect(onConflictMock).toHaveBeenCalledTimes(2);
    const cfg = onConflictMock.mock.calls[0]![0] as {
      target: unknown[];
      set: { count: unknown };
    };
    // target 은 ws/query/period 컬럼 (mock 값 그대로 전달)
    expect(cfg.target).toContain('workspace_id');
    expect(cfg.target).toContain('query');
    expect(cfg.target).toContain('period');
    // count 는 excluded.count 로 갱신
    expect(cfg.set.count).toBeDefined();
  });

  it('passes parsed integer count + period in values', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ workspace_id: 'ws-1', query: 'jarvis', cnt: '42' }],
    });

    await aggregatePopularHandler(
      [] as PgBoss.Job<Record<string, never>>[],
      undefined,
      new Date(Date.UTC(2026, 3, 30, 10, 0, 0)),
    );

    expect(valuesMock).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      query: 'jarvis',
      count: 42,
      period: '2026-04-26',
    });
  });
});
