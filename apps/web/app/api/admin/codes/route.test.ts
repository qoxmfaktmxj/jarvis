import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * P1 #9 회귀 — admin/codes POST 가 codeGroup.workspaceId 가 caller 의 워크스페이스에
 * 속하는지 검증해야 한다. 같은 라우트의 PUT/DELETE 는 ownerGroups 검증을 거치지만
 * POST 만 비대칭이었음.
 */

const { ownerGroupRows, insertReturning } = vi.hoisted(() => ({
  ownerGroupRows: { value: [] as Array<{ id: string }> },
  insertReturning: { value: [{ id: 'item-1', groupId: 'group-1', code: 'A', name: 'Alpha' }] as unknown[] },
}));

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: {
      userId: 'user-1',
      workspaceId: 'ws-1',
      roles: ['ADMIN'],
      permissions: ['admin:all'],
    },
  }),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(ownerGroupRows.value)),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(insertReturning.value)),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  codeGroup: { id: 'id', workspaceId: 'workspace_id', code: 'code' },
  codeItem: { id: 'id', groupId: 'group_id', code: 'code', sortOrder: 'sort_order' },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (col: unknown, val: unknown) => ({ col, val, op: 'eq' }),
  asc: (col: unknown) => ({ col, op: 'asc' }),
  inArray: (col: unknown, vals: unknown[]) => ({ col, vals, op: 'inArray' }),
}));

import { POST } from './route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/codes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/codes — P1 #9 workspace boundary', () => {
  beforeEach(() => {
    ownerGroupRows.value = [];
  });

  it('rejects when groupId belongs to a different workspace (404)', async () => {
    ownerGroupRows.value = []; // simulate: caller workspace 에 그 group 없음

    const res = await POST(
      buildRequest({
        groupId: '00000000-0000-0000-0000-000000000099', // 다른 워크스페이스의 group
        code: 'A',
        name: 'Alpha',
      }),
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });

  it('inserts when groupId belongs to caller workspace (201)', async () => {
    ownerGroupRows.value = [{ id: '00000000-0000-0000-0000-000000000001' }];

    const res = await POST(
      buildRequest({
        groupId: '00000000-0000-0000-0000-000000000001',
        code: 'A',
        name: 'Alpha',
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'item-1', groupId: 'group-1' });
  });

  it('rejects on schema validation failure before workspace check (400)', async () => {
    const res = await POST(
      buildRequest({
        groupId: 'not-a-uuid',
        code: 'A',
        name: 'Alpha',
      }),
    );

    expect(res.status).toBe(400);
  });
});
