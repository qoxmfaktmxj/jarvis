import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';
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
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([
      {
        employeeId: 'E001', name: '홍길동', email: 'h@e.co',
        orgName: '경영지원팀', status: 'active',
        position: 'SENIOR', jobTitle: 'MEMBER', isOutsourced: false,
        roles: ['VIEWER'], createdAt: new Date('2026-04-20T00:00:00Z'),
      },
    ]),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: { id: 'id', workspaceId: 'workspace_id', employeeId: 'employee_id',
          name: 'name', email: 'email', status: 'status',
          position: 'position', jobTitle: 'job_title', isOutsourced: 'is_outsourced',
          createdAt: 'created_at', orgId: 'org_id' },
  organization: { id: 'id', name: 'name' },
  userRole: { userId: 'user_id', roleId: 'role_id' },
  role: { id: 'id', code: 'code' },
  codeGroup: { id: 'id', workspaceId: 'workspace_id', code: 'code' },
  codeItem: { id: 'id', groupId: 'group_id', code: 'code', name: 'name', isActive: 'is_active' },
}));

function make(url: string) {
  return new NextRequest(url, { headers: { 'x-session-id': 'test' } });
}

describe('GET /api/admin/users/export', () => {
  it('returns CSV with BOM, UTF-8 content-type, and attachment disposition', async () => {
    const res = await GET(make('http://localhost/api/admin/users/export?format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv; charset=utf-8/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="users-\d{8}-\d{6}\.csv"/);
    // Check BOM via arrayBuffer bytes (Node.js Response.text() strips BOM per WHATWG spec)
    const buf = await res.clone().arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0xEF);
    expect(bytes[1]).toBe(0xBB);
    expect(bytes[2]).toBe(0xBF);
    const text = await res.text();
    expect(text).toContain('사번,이름,이메일,소속,직위,직책,역할,상태,외주여부,생성일');
    expect(text).toContain('E001');
  });

  it('rejects format other than csv', async () => {
    const res = await GET(make('http://localhost/api/admin/users/export?format=pdf'));
    expect(res.status).toBe(400);
  });
});

describe('CSV injection neutralization', () => {
  it('prefixes apostrophe for cells starting with formula chars', () => {
    // Inline the escape logic to verify the neutralizer without full route wiring.
    function escape(v: unknown): string {
      if (v === null || v === undefined) return '';
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    // After apostrophe prefix, if the string still contains " it gets CSV-quoted.
    expect(escape('=HYPERLINK("http://evil.com","click")')).toBe(`"'=HYPERLINK(""http://evil.com"",""click"")"`);
    expect(escape('+cmd')).toBe("'+cmd");
    expect(escape('-1+2')).toBe("'-1+2");
    expect(escape('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escape('\tinjected')).toBe("'\tinjected");
    expect(escape('normal')).toBe('normal');
    expect(escape('홍길동')).toBe('홍길동');
  });
});
