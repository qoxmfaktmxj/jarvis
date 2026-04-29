// apps/web/app/api/chat/send/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn(),
}));

vi.mock('@/app/actions/chat', () => ({
  sendMessage: vi.fn().mockResolvedValue({ id: 'msg-123' }),
}));

import { requireApiSession } from '@/lib/server/api-auth';
import { POST } from './route';

function make(body: unknown, withAuth = true) {
  return new NextRequest('http://localhost/api/chat/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withAuth ? { 'x-session-id': 'sess-test' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/send', () => {
  it('returns 401 when no session', async () => {
    (requireApiSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await POST(make({ body: 'hello' }, false));
    expect(res.status).toBe(401);
  });

  it('returns 200 with id when authenticated', async () => {
    (requireApiSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { userId: 'u1', workspaceId: 'ws-1', roles: [], permissions: [] },
    });
    const res = await POST(make({ body: 'hello' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.data.id).toBe('msg-123');
  });
});
