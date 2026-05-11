import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Notice query regression tests.
 *
 * D3=B 결정 — 공지는 단일 도메인(PUBLIC). sensitivity 컬럼 + canViewInternalNotice
 * 헬퍼는 Step 2C 에서 제거됨. 본 테스트는 publishVisibilityCondition 의 expiresAt
 * 만료 필터 (A9 F3) 동작이 회귀 없이 유지되는지 가드한다.
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

// P0 F4 — notices.ts 가 audit_log + writeAuditLog 를 import 하므로 모듈 로드 단계에서
// 의존성 그래프를 끊어 둔다. 본 테스트는 read path(listNotices/getNoticeById) 만 검증
// 하므로 audit 호출은 일어나지 않지만, import 자체는 실행되기 때문에 stub 필요.
vi.mock('@jarvis/db/schema/audit', () => ({
  auditLog: { id: 'id' },
}));
vi.mock('@jarvis/shared/audit-log', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ kind: 'and', args }),
  count: () => ({ kind: 'count' }),
  desc: (col: unknown) => ({ kind: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  gt: (col: unknown, val: unknown) => ({ kind: 'gt', col, val }),
  isNull: (col: unknown) => ({ kind: 'isNull', col }),
  lte: (col: unknown, val: unknown) => ({ kind: 'lte', col, val }),
  or: (...args: unknown[]) => ({ kind: 'or', args }),
}));

import { getNoticeById, listNotices } from './notices';

function flattenAnd(w: unknown): unknown[] {
  if (!w || typeof w !== 'object') return [w];
  const node = w as { kind?: string; args?: unknown[] };
  if (node.kind === 'and' && Array.isArray(node.args)) return node.args.flatMap(flattenAnd);
  return [w];
}

describe('listNotices — publish visibility', () => {
  beforeEach(() => {
    listRowsRef.value = [];
    totalCountRef.value = 0;
    capturedConds.listWhere = undefined;
  });

  it('omits publish visibility for ADMIN actor', async () => {
    await listNotices({ workspaceId: 'ws-1', actorRole: 'ADMIN' });
    const conds = flattenAnd(capturedConds.listWhere) as Array<{
      kind: string;
      col?: unknown;
      val?: unknown;
      args?: unknown[];
    }>;
    // ADMIN should only have the workspaceId condition — no publish/expire guard.
    const orClauses = conds.filter((c) => c?.kind === 'or');
    expect(orClauses).toHaveLength(0);
  });

  it('applies publish + expiresAt visibility for non-ADMIN actor (A9 F3)', async () => {
    await listNotices({ workspaceId: 'ws-1', actorRole: 'VIEWER' });
    const conds = flattenAnd(capturedConds.listWhere) as Array<{
      kind: string;
      col?: unknown;
      args?: unknown[];
    }>;
    // The visibility condition is `and(or(...publish), or(...expires))`.
    // After flattening one level we should see at least two `or` nodes.
    const orClauses = conds.filter((c) => c?.kind === 'or');
    expect(orClauses.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getNoticeById — visibility window (A9 F3)', () => {
  beforeEach(() => {
    byIdRowsRef.value = [];
  });

  it('returns row when actorRole is undefined regardless of publish/expire timestamps', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    byIdRowsRef.value = [
      { id: 'n-1', bodyMd: 'memo', publishedAt: future, expiresAt: past },
    ];
    const result = await getNoticeById('n-1', 'ws-1');
    expect(result?.bodyMd).toBe('memo');
  });

  it('returns row for ADMIN even when expired', async () => {
    const past = new Date(Date.now() - 86_400_000);
    byIdRowsRef.value = [
      { id: 'n-1', bodyMd: 'expired', publishedAt: past, expiresAt: past },
    ];
    const result = await getNoticeById('n-1', 'ws-1', { actorRole: 'ADMIN' });
    expect(result?.bodyMd).toBe('expired');
  });

  it('returns null for non-admin actor when notice expired', async () => {
    const past = new Date(Date.now() - 86_400_000);
    byIdRowsRef.value = [
      { id: 'n-1', bodyMd: 'expired', publishedAt: past, expiresAt: past },
    ];
    const result = await getNoticeById('n-1', 'ws-1', { actorRole: 'VIEWER' });
    expect(result).toBeNull();
  });

  it('returns null for non-admin actor when not yet published', async () => {
    const future = new Date(Date.now() + 86_400_000);
    byIdRowsRef.value = [
      { id: 'n-1', bodyMd: 'unpublished', publishedAt: future, expiresAt: null },
    ];
    const result = await getNoticeById('n-1', 'ws-1', { actorRole: 'VIEWER' });
    expect(result).toBeNull();
  });

  it('returns row for non-admin actor when within publish window', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    byIdRowsRef.value = [
      { id: 'n-1', bodyMd: 'live', publishedAt: past, expiresAt: future },
    ];
    const result = await getNoticeById('n-1', 'ws-1', { actorRole: 'VIEWER' });
    expect(result?.bodyMd).toBe('live');
  });
});
