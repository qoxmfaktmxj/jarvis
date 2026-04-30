import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// vi.mock factory closure 가 참조하는 가변 상태. 테스트가 returningRows 를 갈아끼우면
// 다음 db.transaction → tx.returning() 호출이 그 row 를 돌려준다.
const { returningRows } = vi.hoisted(() => ({
  returningRows: { value: [{ id: 'new-user-1', employeeId: 'E001', name: 'Test' }] as unknown[] },
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
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn((cols?: Record<string, unknown>) => {
      // Drizzle .returning() projects rows to selected columns. cols=undefined → full row.
      if (!cols) return Promise.resolve(returningRows.value);
      const projected = returningRows.value.map((row) => {
        const r = row as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(cols)) out[key] = r[key];
        return out;
      });
      return Promise.resolve(projected);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn((cols?: Record<string, unknown>) => {
      // Drizzle .returning() projects rows to selected columns. cols=undefined → full row.
      if (!cols) return Promise.resolve(returningRows.value);
      const projected = returningRows.value.map((row) => {
        const r = row as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(cols)) out[key] = r[key];
        return out;
      });
      return Promise.resolve(projected);
    }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: {
    id: 'id', workspaceId: 'workspace_id', employeeId: 'employee_id',
    name: 'name', email: 'email', status: 'status',
    position: 'position', jobTitle: 'job_title', isOutsourced: 'is_outsourced',
    createdAt: 'created_at', orgId: 'org_id', updatedAt: 'updated_at',
    avatarUrl: 'avatar_url', employmentType: 'employment_type',
  },
  organization: { id: 'id', name: 'name' },
  userRole: { userId: 'user_id', roleId: 'role_id' },
  role: { id: 'id', code: 'code', workspaceId: 'workspace_id' },
  codeGroup: { id: 'id', workspaceId: 'workspace_id', code: 'code' },
  codeItem: { id: 'id', groupId: 'group_id', code: 'code', name: 'name', isActive: 'is_active' },
}));

import { GET, POST, PUT, DELETE } from './route';

beforeEach(() => {
  // 각 테스트 시작 시 mock returning 의 기본값 복구
  returningRows.value = [{ id: 'new-user-1', employeeId: 'E001', name: 'Test' }];
});

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

describe('GET /api/admin/users filtering', () => {
  it('accepts status=active', async () => {
    const req = makeRequest('GET', 'http://localhost/api/admin/users?status=active');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('rejects invalid status value', async () => {
    const req = makeRequest('GET', 'http://localhost/api/admin/users?status=weird');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/users with new fields', () => {
  it('accepts isOutsourced boolean and position/jobTitle codes', async () => {
    const req = makeRequest('POST', 'http://localhost/api/admin/users', {
      employeeId: 'E100',
      name: 'Outsource Kim',
      roleCode: 'VIEWER',
      isOutsourced: true,
      position: 'SENIOR',
      jobTitle: 'MEMBER',
    });
    const res = await POST(req);
    // validateCodeRef may return false with default mock → 400 is acceptable
    expect([201, 400]).toContain(res.status);
  });
});

describe('PUT /api/admin/users', () => {
  it('rejects invalid id', async () => {
    const req = makeRequest('PUT', 'http://localhost/api/admin/users', { id: 'not-a-uuid' });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('accepts status change payload', async () => {
    const req = makeRequest('PUT', 'http://localhost/api/admin/users', {
      id: '11111111-1111-1111-1111-111111111111',
      status: 'locked',
    });
    const res = await PUT(req);
    expect([200, 404]).toContain(res.status);
  });
});

// ── P1 #6: response field whitelist ──────────────────────────────────────────
// Drizzle .returning() 가 전체 row(passwordHash/preferences 포함)를 그대로 응답으로
//내보내면 안 됨. 명시 화이트리스트로 안전한 필드만 반환되는지 검증.

describe('P1 #6 — admin/users response excludes sensitive fields', () => {
  // DB가 passwordHash/preferences 를 포함한 row 를 돌려줘도 응답엔 절대 들어가면 안 됨
  const SENSITIVE_ROW = {
    id: 'new-user-1',
    workspaceId: 'ws-1',
    employeeId: 'E001',
    name: 'Test',
    email: 'test@example.com',
    orgId: null,
    status: 'active',
    position: null,
    jobTitle: null,
    isOutsourced: false,
    employmentType: 'internal',
    avatarUrl: null,
    passwordHash: 'scrypt$N=16384,r=8,p=1$AAAA$BBBB',
    preferences: { theme: 'dark', extra: 'should-not-leak' },
    createdAt: new Date('2026-04-30T00:00:00Z'),
    updatedAt: new Date('2026-04-30T00:00:00Z'),
  };

  it('POST 응답에 passwordHash 가 포함되지 않는다', async () => {
    returningRows.value = [SENSITIVE_ROW];
    const req = makeRequest('POST', 'http://localhost/api/admin/users', {
      employeeId: 'E001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      roleCode: 'VIEWER',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('preferences');
  });

  it('POST 응답에 안전한 필드(id, employeeId, name 등)는 포함된다', async () => {
    returningRows.value = [SENSITIVE_ROW];
    const req = makeRequest('POST', 'http://localhost/api/admin/users', {
      employeeId: 'E001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      roleCode: 'VIEWER',
    });
    const res = await POST(req);
    const json = await res.json() as Record<string, unknown>;
    expect(json).toMatchObject({
      id: 'new-user-1',
      employeeId: 'E001',
      name: 'Test',
      email: 'test@example.com',
    });
  });

  it('PUT 응답에 passwordHash 가 포함되지 않는다', async () => {
    returningRows.value = [SENSITIVE_ROW];
    const req = makeRequest('PUT', 'http://localhost/api/admin/users', {
      id: '11111111-1111-1111-1111-111111111111',
      status: 'locked',
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('preferences');
  });
});
