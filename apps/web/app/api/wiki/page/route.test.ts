import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Stubs — page.tsx와 동일한 분기 규약을 검증한다.
// 실제 구현은 @/lib/server/api-auth 에서 requireApiSession 을 가져온다.
const mockSession = vi.fn();
const mockLoad = vi.fn();
const mockOrphans = vi.fn();

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: (...a: unknown[]) => mockSession(...a),
}));
vi.mock('@/lib/server/wiki-page-loader', () => ({
  loadWikiPageForView: (...a: unknown[]) => mockLoad(...a),
}));
vi.mock('@/lib/server/wiki-page-orphans', () => ({
  loadOrphanOutboundSlugs: (...a: unknown[]) => mockOrphans(...a),
}));

import { GET } from './route';

const TEST_SESSION = { workspaceId: 'ws1', permissions: ['knowledge:read'] };

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/wiki/page?${qs}`);
}

describe('GET /api/wiki/page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // requireApiSession returns { session, response?: never } on success
    mockSession.mockResolvedValue({ session: TEST_SESSION });
    mockOrphans.mockResolvedValue([]);
  });

  it('401 when requireApiSession returns response (no session)', async () => {
    mockSession.mockResolvedValue({
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(401);
  });

  it('400 when workspaceId or path missing', async () => {
    const res = await GET(makeReq('workspaceId=ws1'));
    expect(res.status).toBe(400);
  });

  it('403 when session.workspaceId !== query workspaceId', async () => {
    const res = await GET(makeReq('workspaceId=other&path=foo/bar.md'));
    expect(res.status).toBe(403);
  });

  it('404 when loader returns null (not found)', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(404);
  });

  it('404 when loader returns null (access denied — not distinguishable from not found)', async () => {
    // The loader returns null for both missing pages and unauthorized access,
    // and the route responds 404 in both cases to avoid leaking existence.
    mockLoad.mockResolvedValue(null);
    const res = await GET(makeReq('workspaceId=ws1&path=secret.md'));
    expect(res.status).toBe(404);
  });

  it('200 with body+meta+orphanSlugs on success', async () => {
    mockLoad.mockResolvedValue({
      meta: { id: 'p1', title: 'Foo', sensitivity: 'INTERNAL', path: 'foo.md', slug: 'foo' },
      bodyOnly: '# Foo',
    });
    mockOrphans.mockResolvedValue(['bar']);
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.title).toBe('Foo');
    expect(json.body).toBe('# Foo');
    expect(json.orphanSlugs).toEqual(['bar']);
  });

  it('passes session as third argument to loadWikiPageForView', async () => {
    mockLoad.mockResolvedValue({
      meta: { id: 'p1', title: 'Foo', sensitivity: 'INTERNAL', path: 'foo.md', slug: 'foo' },
      bodyOnly: '...',
    });
    await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(mockLoad).toHaveBeenCalledWith('ws1', 'foo', TEST_SESSION);
  });

  it('decodes encoded path segments and strips .md before lookup', async () => {
    mockLoad.mockResolvedValue({
      meta: { id: 'p1', title: 'Foo', sensitivity: 'INTERNAL', path: '한글/page.md', slug: 'page' },
      bodyOnly: '...',
    });
    // ingest worker는 routeKey를 `.md` 없이 db에 저장하므로 (write-and-commit.ts:340),
    // API도 caller가 `.md`를 붙여 보내든 안 보내든 strip 후 lookup 한다.
    await GET(makeReq('workspaceId=ws1&path=' + encodeURIComponent('한글/page.md')));
    expect(mockLoad).toHaveBeenCalledWith('ws1', '한글/page', TEST_SESSION);
  });
});
