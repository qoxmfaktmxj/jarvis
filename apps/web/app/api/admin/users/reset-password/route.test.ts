import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: { userId: 'u1', workspaceId: 'ws-1', roles: ['ADMIN'], permissions: ['admin:all'] },
  }),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'u-target' }]),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: { id: 'id', workspaceId: 'workspace_id' },
}));

function make(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': 'test' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/users/reset-password', () => {
  it('returns 501 with not_implemented error when user exists', async () => {
    const res = await POST(make({ id: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toBe('not_implemented');
  });

  it('returns 400 when id is missing', async () => {
    const res = await POST(make({}));
    expect(res.status).toBe(400);
  });
});
