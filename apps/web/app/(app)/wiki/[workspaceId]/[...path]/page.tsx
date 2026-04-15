import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { hasPermission } from '@jarvis/auth/rbac';
import { requirePageSession } from '@/lib/server/page-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { canViewSensitivity } from '@/lib/server/wiki-sensitivity';
import { mapDbRowToWikiPage } from '@/components/WikiPageView';
import { WikiPageWithNav } from './_components/WikiPageWithNav';

export const dynamic = 'force-dynamic';

type WikiDetailPageProps = {
  params: Promise<{ workspaceId: string; path: string[] }>;
};

export default async function WikiDetailPage({ params }: WikiDetailPageProps) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const { workspaceId, path } = await params;
  const slug = path.join('/');

  // Phase-W2: workspace 일치 검증 (다른 워크스페이스 페이지는 접근 불가)
  if (session.workspaceId !== workspaceId) {
    const t = await getTranslations('Wiki');
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t('accessDenied')}</h1>
        <p className="text-sm text-gray-500">{slug}</p>
      </div>
    );
  }

  const loaded = await loadWikiPageForView(workspaceId, slug);
  if (!loaded) {
    notFound();
  }

  // sensitivity 권한 필터: DB 의 4값(PUBLIC|INTERNAL|RESTRICTED|SECRET_REF_ONLY) 기준
  if (!canViewSensitivity(session, loaded.meta.sensitivity)) {
    const t = await getTranslations('Wiki');
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t('accessDenied')}</h1>
        <p className="text-sm text-gray-500">{loaded.meta.slug}</p>
      </div>
    );
  }

  // WIKI-AGENTS.md §6: frontmatter `requiredPermission` (최소 요구 권한) 서버 게이트.
  // sensitivity 필터와 직교하는 추가 축 — URL 직접 접근 시 RBAC 우회 방지.
  // ADMIN_ALL 은 항상 통과.
  if (
    loaded.meta.requiredPermission &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL) &&
    !hasPermission(session, loaded.meta.requiredPermission)
  ) {
    const t = await getTranslations('Wiki');
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t('accessDenied')}</h1>
        <p className="text-sm text-gray-500">{loaded.meta.slug}</p>
      </div>
    );
  }

  const page = mapDbRowToWikiPage(loaded.meta, loaded.bodyOnly);

  return <WikiPageWithNav page={page} workspaceId={workspaceId} />;
}
