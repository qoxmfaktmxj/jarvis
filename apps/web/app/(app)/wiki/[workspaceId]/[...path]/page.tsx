import { forbidden, notFound } from 'next/navigation';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { requirePageSession } from '@/lib/server/page-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { loadOrphanOutboundSlugs } from '@/lib/server/wiki-page-orphans';
import { mapDbRowToWikiPage } from '@/components/WikiPageView';
import { WikiPageWithNav } from './_components/WikiPageWithNav';

export const dynamic = 'force-dynamic';

type WikiDetailPageProps = {
  params: Promise<{ workspaceId: string; path: string[] }>;
};

/**
 * T6 — wiki viewer 안정화.
 *
 * 분기 규약:
 *   - DB 에 페이지 없음          → `notFound()` (HTTP 404)
 *   - workspace 불일치           → `forbidden()` (HTTP 403)
 *   - sensitivity 권한 부족      → `forbidden()` (HTTP 403)
 *   - `requiredPermission` 부족  → `forbidden()` (HTTP 403)
 *
 * 이전 구현은 403 상황에서도 200+content(`<div>accessDenied</div>`) 를 돌려줘
 * 브라우저/프록시/크롤러가 권한 실패를 "정상 응답" 으로 간주하는 문제가 있었다.
 * Next.js 15.1+ 의 `forbidden()` API(`experimental.authInterrupts`) 로 전환해
 * `apps/web/app/forbidden.tsx` 가 실제 HTTP 403 과 함께 렌더되도록 한다.
 *
 * 또한 본문에 포함된 `[[...]]` wikilink 중 target 이 아직 없는(orphan) 링크 목록을
 * `wiki_page_link.toPageId IS NULL` 조회로 얻어 `WikiPageView` 로 넘긴다.
 * 클라이언트는 `orphanSlugs` prop 으로 해당 링크에 `orphan-slug` 클래스와
 * 점선 빨간 스타일을 적용해 존재하지 않는 페이지임을 시각적으로 구분한다.
 */
export default async function WikiDetailPage({ params }: WikiDetailPageProps) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const { workspaceId, path } = await params;
  // Next.js 15 dynamic catch-all segments are URL-encoded; decode each segment
  // before joining so DB lookups match routeKeys stored in decoded form (e.g. 한글).
  const routeKey = path
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');

  // Phase-W2: workspace 일치 검증 (다른 워크스페이스 페이지는 접근 불가).
  // 세션 워크스페이스가 아니면 명시적 403.
  if (session.workspaceId !== workspaceId) {
    forbidden();
  }

  // Pass session so sensitivity + requiredPermission are filtered in the DB query.
  // Both "not found" and "access denied" return null; use notFound() for both so
  // callers cannot enumerate pages they lack access to.
  const loaded = await loadWikiPageForView(workspaceId, routeKey, session);
  if (!loaded) {
    // DB 에 페이지가 없거나 publishedStatus != 'published' / 접근 권한 없음 / 디스크 drift → 404.
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const page = mapDbRowToWikiPage(loaded!.meta, loaded!.bodyOnly);
  const orphanSlugs = await loadOrphanOutboundSlugs(workspaceId, loaded!.meta.id);

  return (
    <WikiPageWithNav
      page={page}
      workspaceId={workspaceId}
      orphanSlugs={orphanSlugs}
    />
  );
}
