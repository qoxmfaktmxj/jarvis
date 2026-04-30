import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P1 #10 회귀 — notice sensitivity 필터.
 *
 * notice 스키마는 sensitivity ∈ { PUBLIC, INTERNAL } 컬럼을 정의하지만 listNotices/
 * getNoticeById 가 이 컬럼을 where 절에 반영하지 않아 외부 직원(VIEWER) 도 INTERNAL
 * bodyMd 전문을 볼 수 있었음. 이 테스트는 INTERNAL_TIER_ROLES 헬퍼와 query 분기가
 * 일관되게 동작하는지 가드한다.
 */

const { listRowsRef, totalCountRef, byIdRowsRef, capturedConds } = vi.hoisted(() => ({
  listRowsRef: { value: [] as unknown[] },
  totalCountRef: { value: 0 },
  byIdRowsRef: { value: [] as unknown[] },
  capturedConds: { listWhere: undefined as unknown },
}));

vi.mock('@jarvis/db/client', () => {
  function makeChain() {
    const ops: string[] = [];
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn((cond: unknown) => {
        ops.push('where');
        // listNotices 가 호출하는 첫 번째 select() 의 where 만 캡처 (rows 쪽).
        // count 쪽은 select({value: count()}) 분기로 빠지므로 안 옴.
        if (capturedConds.listWhere === undefined) capturedConds.listWhere = cond;
        return chain;
      }),
      orderBy: vi.fn(() => {
        ops.push('orderBy');
        return chain;
      }),
      limit: vi.fn(() => {
        ops.push('limit');
        // getNoticeById 는 .limit() 에서 await — Promise 반환.
        // listNotices 는 .limit() 후 .offset() — chain 유지.
        // 여기서는 chain 도 thenable 처럼 동작하도록 then 도 노출.
        const p = Promise.resolve(byIdRowsRef.value);
        const enriched = chain as Record<string, unknown> & { then: typeof p.then };
        enriched.then = p.then.bind(p);
        return chain;
      }),
      offset: vi.fn(() => Promise.resolve(listRowsRef.value)),
    };
    return chain;
  }

  return {
    db: {
      select: vi.fn((cols?: unknown) => {
        if (cols) {
          // count chain
          return {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(() =>
              Promise.resolve([{ value: totalCountRef.value }]),
            ),
          };
        }
        capturedConds.listWhere = undefined; // 새 select 시작마다 초기화
        return makeChain();
      }),
    },
  };
});

vi.mock('@jarvis/db/schema/notice', () => ({
  notice: {
    id: 'id',
    workspaceId: 'workspace_id',
    sensitivity: 'sensitivity',
    pinned: 'pinned',
    publishedAt: 'published_at',
    expiresAt: 'expires_at',
    bodyMd: 'body_md',
    title: 'title',
    authorId: 'author_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ kind: 'and', args }),
  count: () => ({ kind: 'count' }),
  desc: (col: unknown) => ({ kind: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  isNull: (col: unknown) => ({ kind: 'isNull', col }),
  lte: (col: unknown, val: unknown) => ({ kind: 'lte', col, val }),
  or: (...args: unknown[]) => ({ kind: 'or', args }),
}));

import {
  INTERNAL_TIER_ROLES,
  canViewInternalNotice,
  getNoticeById,
  listNotices,
} from './notices';

function flattenAnd(w: unknown): unknown[] {
  if (!w || typeof w !== 'object') return [w];
  const node = w as { kind?: string; args?: unknown[] };
  if (node.kind === 'and' && Array.isArray(node.args)) return node.args.flatMap(flattenAnd);
  return [w];
}

describe('canViewInternalNotice — P1 #10', () => {
  it('returns true when user has any internal-tier role', () => {
    expect(canViewInternalNotice(['ADMIN'])).toBe(true);
    expect(canViewInternalNotice(['MANAGER'])).toBe(true);
    expect(canViewInternalNotice(['HR'])).toBe(true);
    expect(canViewInternalNotice(['DEVELOPER'])).toBe(true);
    expect(canViewInternalNotice(['DEVELOPER', 'VIEWER'])).toBe(true);
  });

  it('returns false for VIEWER-only and empty roles', () => {
    expect(canViewInternalNotice(['VIEWER'])).toBe(false);
    expect(canViewInternalNotice([])).toBe(false);
    expect(canViewInternalNotice(['UNKNOWN'])).toBe(false);
  });

  it('exposes INTERNAL_TIER_ROLES set with expected membership', () => {
    expect(INTERNAL_TIER_ROLES.has('ADMIN')).toBe(true);
    expect(INTERNAL_TIER_ROLES.has('VIEWER')).toBe(false);
  });
});

describe('listNotices — P1 #10 sensitivity filter', () => {
  beforeEach(() => {
    listRowsRef.value = [];
    totalCountRef.value = 0;
    capturedConds.listWhere = undefined;
  });

  it('adds sensitivity = PUBLIC condition when canViewInternal=false', async () => {
    await listNotices({ workspaceId: 'ws-1', canViewInternal: false });
    const conds = flattenAnd(capturedConds.listWhere) as Array<{ kind: string; col: unknown; val: unknown }>;
    const sensitivityEq = conds.find((c) => c?.kind === 'eq' && c.col === 'sensitivity');
    expect(sensitivityEq).toBeDefined();
    expect(sensitivityEq?.val).toBe('PUBLIC');
  });

  it('omits sensitivity condition when canViewInternal=true', async () => {
    await listNotices({ workspaceId: 'ws-1', canViewInternal: true });
    const conds = flattenAnd(capturedConds.listWhere) as Array<{ kind: string; col: unknown; val: unknown }>;
    const sensitivityEq = conds.find((c) => c?.kind === 'eq' && c.col === 'sensitivity');
    expect(sensitivityEq).toBeUndefined();
  });

  it('defaults to PUBLIC-only when canViewInternal is omitted', async () => {
    await listNotices({ workspaceId: 'ws-1' });
    const conds = flattenAnd(capturedConds.listWhere) as Array<{ kind: string; col: unknown; val: unknown }>;
    const sensitivityEq = conds.find((c) => c?.kind === 'eq' && c.col === 'sensitivity');
    expect(sensitivityEq?.val).toBe('PUBLIC');
  });
});

describe('getNoticeById — P1 #10 sensitivity gate', () => {
  beforeEach(() => {
    byIdRowsRef.value = [];
  });

  it('returns null when row is INTERNAL and canViewInternal=false', async () => {
    byIdRowsRef.value = [
      { id: 'n-1', sensitivity: 'INTERNAL', bodyMd: 'secret stuff' },
    ];
    const result = await getNoticeById('n-1', 'ws-1', false);
    expect(result).toBeNull();
  });

  it('returns row when INTERNAL and canViewInternal=true', async () => {
    byIdRowsRef.value = [
      { id: 'n-1', sensitivity: 'INTERNAL', bodyMd: 'internal memo' },
    ];
    const result = await getNoticeById('n-1', 'ws-1', true);
    expect(result?.bodyMd).toBe('internal memo');
  });

  it('returns row when PUBLIC regardless of canViewInternal', async () => {
    byIdRowsRef.value = [
      { id: 'n-1', sensitivity: 'PUBLIC', bodyMd: 'public note' },
    ];
    const result = await getNoticeById('n-1', 'ws-1', false);
    expect(result?.bodyMd).toBe('public note');
  });
});
