import { NextResponse, type NextRequest } from 'next/server';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { requireApiSession } from '@/lib/server/api-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { loadOrphanOutboundSlugs } from '@/lib/server/wiki-page-orphans';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wiki/page?workspaceId=<UUID>&path=<routeKey>
 *
 * `/wiki/[workspaceId]/[...path]/page.tsx`의 권한 분기를 그대로 이식한 JSON endpoint.
 * `/ask` split-pane WikiPanel이 인라인으로 wiki body를 가져갈 때 사용한다.
 *
 * Security (P2 fix): sensitivity + requiredPermission 필터를 loadWikiPageForView의
 * DB WHERE 절로 이동했다. 미허가 행(또는 존재하지 않는 행)은 모두 404로 응답해
 * 페이지 존재 여부를 노출하지 않는다.
 *
 * 분기:
 *   401 — 세션 없음 / 기본 권한 부족
 *   400 — workspaceId/path 누락
 *   403 — workspace 불일치
 *   404 — DB에 페이지 없음 / 접근 불가 (구분하지 않음)
 *   200 — { meta, body, orphanSlugs }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const url = req.nextUrl;
  const workspaceId = url.searchParams.get('workspaceId');
  const rawPath = url.searchParams.get('path');

  if (!workspaceId || !rawPath) {
    return NextResponse.json({ error: 'workspaceId and path required' }, { status: 400 });
  }

  if (session.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Decode each segment so DB lookup matches stored routeKeys (한글 등).
  // ingest write-and-commit는 routeKey를 `.md` 없이 저장하므로 caller가 `.md`를 붙여 보내도 strip한다.
  const routeKey = rawPath
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/')
    .replace(/\.md$/, '');

  // Pass session to loadWikiPageForView so permission/sensitivity filtering happens
  // inside the DB query. Unauthorized rows are not returned at all — no disk I/O
  // occurs for pages the caller cannot access. Both "not found" and "access denied"
  // return null, and we respond 404 in both cases to avoid leaking existence.
  const loaded = await loadWikiPageForView(workspaceId, routeKey, session);
  if (!loaded) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const orphanSlugs = await loadOrphanOutboundSlugs(workspaceId, loaded.meta.id);

  return NextResponse.json({
    meta: loaded.meta,
    body: loaded.bodyOnly,
    orphanSlugs,
  });
}
