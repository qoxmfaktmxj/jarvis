import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getSessionMock,
  hasPermissionMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
  dbTransactionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

vi.mock('@jarvis/auth/session', () => ({ getSession: getSessionMock }));
vi.mock('@jarvis/auth/rbac', () => ({ hasPermission: hasPermissionMock }));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  outManage: {},
  outManageDetail: {},
}));

import { GET, POST, PUT } from './route';

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: 'sessionId=session-1',
      ...init?.headers,
    },
  });
}

const managerSession = {
  id: 'session-1',
  userId: 'u1',
  workspaceId: 'ws1',
  roles: ['MANAGER'],
  permissions: ['attendance:read', 'attendance:admin'],
};

const memberSession = {
  id: 'session-1',
  userId: 'u1',
  workspaceId: 'ws1',
  roles: ['MEMBER'],
  permissions: ['attendance:read', 'attendance:write'],
};

describe('GET /api/attendance/out-manage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(managerSession);
    hasPermissionMock.mockReturnValue(true);
  });

  it('returns 401 with no session cookie', async () => {
    const res = await GET(new NextRequest('http://localhost/api/attendance/out-manage'));
    expect(res.status).toBe(401);
  });

  it('returns paginated list with details', async () => {
    const rows = [{ id: 'om1', outDate: '2026-04-10', status: 'pending', workspaceId: 'ws1', userId: 'u1' }];
    const detailRows = [{ id: 'd1', outManageId: 'om1', timeFrom: new Date(), timeTo: new Date() }];
    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(rows),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(detailRows),
      });

    const res = await GET(buildRequest('http://localhost/api/attendance/out-manage'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].details).toHaveLength(1);
    expect(json.meta.total).toBe(1);
  });
});

describe('POST /api/attendance/out-manage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(memberSession);
    hasPermissionMock.mockReturnValue(true);
  });

  it('returns 400 for missing details array', async () => {
    const res = await POST(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'POST',
        body: JSON.stringify({
          outDate: '2026-04-10',
          outType: 'errand',
          purpose: 'Bank errand',
          details: [],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when timeTo is before timeFrom', async () => {
    const res = await POST(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'POST',
        body: JSON.stringify({
          outDate: '2026-04-10',
          outType: 'errand',
          purpose: 'Bank errand',
          details: [
            {
              timeFrom: '2026-04-10T14:00:00+09:00',
              timeTo: '2026-04-10T13:00:00+09:00',
              activity: 'Banking',
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates record and details in transaction', async () => {
    const createdRecord = { id: 'om2', outDate: '2026-04-10', status: 'pending', workspaceId: 'ws1', userId: 'u1', outType: 'errand', destination: null, purpose: 'Bank errand', companyId: null, approvedBy: null, createdAt: new Date(), updatedAt: new Date() };
    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const txMock = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnThis(),
          returning: vi.fn()
            .mockResolvedValueOnce([createdRecord])
            .mockResolvedValueOnce([{ id: 'd2', outManageId: 'om2' }]),
        }),
      };
      return fn(txMock);
    });

    const res = await POST(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'POST',
        body: JSON.stringify({
          outDate: '2026-04-10',
          outType: 'errand',
          purpose: 'Bank errand',
          details: [
            {
              timeFrom: '2026-04-10T10:00:00+09:00',
              timeTo: '2026-04-10T12:00:00+09:00',
              activity: 'Banking',
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/attendance/out-manage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(managerSession);
    hasPermissionMock.mockReturnValue(true);
  });

  it('returns 403 for non-manager', async () => {
    hasPermissionMock.mockReturnValueOnce(false);
    const res = await PUT(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'PUT',
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', action: 'approve' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 409 when already approved', async () => {
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001', status: 'approved' }]),
    });
    const res = await PUT(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'PUT',
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', action: 'approve' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(409);
  });

  it('approves a pending request', async () => {
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001', status: 'pending', workspaceId: 'ws1' }]),
    });
    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001', status: 'approved' }]),
    });
    const res = await PUT(
      buildRequest('http://localhost/api/attendance/out-manage', {
        method: 'PUT',
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', action: 'approve' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('approved');
  });
});
