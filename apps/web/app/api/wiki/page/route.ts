import { NextResponse, type NextRequest } from 'next/server';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { requireApiSession } from '@/lib/server/api-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { loadOrphanOutboundSlugs } from '@/lib/server/wiki-page-orphans';
import { canViewSensitivity } from '@/lib/server/wiki-sensitivity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wiki/page?workspaceId=<UUID>&path=<routeKey>
 *
 * `/wiki/[workspaceId]/[...path]/page.tsx`의 권한 분기를 그대로 이식한 JSON endpoint.
 * `/ask` split-pane WikiPanel이 인라인으로 wiki body를 가져갈 때 사용한다.
 *
 * 분기:
 *   401 — 세션 없음 / 기본 권한 부족
 *   400 — workspaceId/path 누락
 *   403 — workspace 불일치 / sensitivity 부족 / requiredPermission 부족
 *   404 — DB에 페이지 없음
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
  const routeKey = rawPath
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');

  const loaded = await loadWikiPageForView(workspaceId, routeKey);
  if (!loaded) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!canViewSensitivity(session, loaded.meta.sensitivity)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (
    loaded.meta.requiredPermission &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL) &&
    !hasPermission(session, loaded.meta.requiredPermission)
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const orphanSlugs = await loadOrphanOutboundSlugs(workspaceId, loaded.meta.id);

  return NextResponse.json({
    meta: loaded.meta,
    body: loaded.bodyOnly,
    orphanSlugs,
  });
}
