import { forbidden, notFound } from 'next/navigation';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { hasPermission } from '@jarvis/auth/rbac';
import { requirePageSession } from '@/lib/server/page-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { loadOrphanOutboundSlugs } from '@/lib/server/wiki-page-orphans';
import { canViewSensitivity } from '@/lib/server/wiki-sensitivity';
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

  const loaded = await loadWikiPageForView(workspaceId, routeKey);
  if (!loaded) {
    // DB 에 페이지가 없거나 publishedStatus != 'published' / 디스크 drift → 404.
    notFound();
  }

  // sensitivity 권한 필터: DB 의 4값(PUBLIC|INTERNAL|RESTRICTED|SECRET_REF_ONLY) 기준.
  // 페이지는 존재하나 열람 권한이 없는 것이므로 403 이 맞다(404 로 숨기지 않는다 —
  // Jarvis 는 내부 포털이라 enumeration 회피보다 상태코드 정확성이 우선).
  if (!canViewSensitivity(session, loaded.meta.sensitivity)) {
    forbidden();
  }

  // WIKI-AGENTS.md §6: frontmatter `requiredPermission` (최소 요구 권한) 서버 게이트.
  // sensitivity 필터와 직교하는 추가 축 — URL 직접 접근 시 RBAC 우회 방지.
  // ADMIN_ALL 은 항상 통과.
  if (
    loaded.meta.requiredPermission &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL) &&
    !hasPermission(session, loaded.meta.requiredPermission)
  ) {
    forbidden();
  }

  const page = mapDbRowToWikiPage(loaded.meta, loaded.bodyOnly);
  const orphanSlugs = await loadOrphanOutboundSlugs(workspaceId, loaded.meta.id);

  return (
    <WikiPageWithNav
      page={page}
      workspaceId={workspaceId}
      orphanSlugs={orphanSlugs}
    />
  );
}
