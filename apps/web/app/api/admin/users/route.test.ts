import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';
import { NextRequest } from 'next/server';

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
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'new-user-1', employeeId: 'E001', name: 'Test' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-user-1', employeeId: 'E001', name: 'Test' }]),
    })),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: { id: 'id', workspaceId: 'workspace_id', employeeId: 'employee_id', name: 'name', email: 'email', isActive: 'is_active', createdAt: 'created_at', orgId: 'org_id', updatedAt: 'updated_at' },
  organization: { id: 'id', name: 'name' },
  userRole: { userId: 'user_id', roleId: 'role_id' },
  role: { id: 'id', code: 'code', workspaceId: 'workspace_id' },
}));

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-session-id': 'test-session' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/admin/users', () => {
  it('returns paginated user list', async () => {
    const req = makeRequest('GET', 'http://localhost/api/admin/users?page=1&limit=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/users', () => {
  it('creates a user with valid payload', async () => {
    const req = makeRequest('POST', 'http://localhost/api/admin/users', {
      employeeId: 'E001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      roleCode: 'VIEWER',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('rejects invalid payload', async () => {
    const req = makeRequest('POST', 'http://localhost/api/admin/users', { name: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users', () => {
  it('requires id param', async () => {
    const req = makeRequest('DELETE', 'http://localhost/api/admin/users');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
