import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getSessionMock,
  hasPermissionMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

vi.mock('@jarvis/auth/session', () => ({ getSession: getSessionMock }));
vi.mock('@jarvis/auth/rbac', () => ({ hasPermission: hasPermissionMock }));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  attendance: {},
}));

import { GET, POST } from './route';

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: 'sessionId=session-1',
      ...init?.headers,
    },
  });
}

const defaultSession = {
  id: 'session-1',
  userId: 'user-1',
  workspaceId: 'ws-1',
  roles: ['MEMBER'],
  permissions: ['attendance:read', 'attendance:write'],
};

describe('GET /api/attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(defaultSession);
    hasPermissionMock.mockReturnValue(true);
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    });
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await GET(new NextRequest('http://localhost/api/attendance'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid month format', async () => {
    const res = await GET(buildRequest('http://localhost/api/attendance?month=not-a-month'));
    expect(res.status).toBe(400);
  });

  it('returns 403 when requesting another user without ATTENDANCE_ADMIN', async () => {
    hasPermissionMock
      .mockReturnValueOnce(true)  // ATTENDANCE_READ passes
      .mockReturnValueOnce(false); // ATTENDANCE_ADMIN fails
    const res = await GET(
      buildRequest('http://localhost/api/attendance?month=2026-04&userId=00000000-0000-0000-0000-000000000001'),
    );
    expect(res.status).toBe(403);
  });

  it('returns attendance records for the month', async () => {
    const mockRecords = [
      { id: 'a1', attendDate: '2026-04-01', status: 'present', checkIn: null, checkOut: null },
    ];
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRecords),
    });
    const res = await GET(buildRequest('http://localhost/api/attendance?month=2026-04'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

describe('POST /api/attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(defaultSession);
    hasPermissionMock.mockReturnValue(true);
  });

  it('returns 401 when no session', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'check-in' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid action', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    const res = await POST(
      buildRequest('http://localhost/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid-action' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when checking in twice', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: 'a1', checkIn: new Date(), checkOut: null },
      ]),
    });
    const res = await POST(
      buildRequest('http://localhost/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'check-in' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when checking out without check-in', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'a1', checkIn: null, checkOut: null }]),
    });
    const res = await POST(
      buildRequest('http://localhost/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'check-out' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(409);
  });

  it('creates a new attendance record on first check-in', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-1', checkIn: new Date(), status: 'present' }]),
    });
    const res = await POST(
      buildRequest('http://localhost/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'check-in' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toHaveProperty('id', 'new-1');
  });
});
