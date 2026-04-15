import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
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

  const page = mapDbRowToWikiPage(loaded.meta, loaded.bodyOnly);

  return <WikiPageWithNav page={page} workspaceId={workspaceId} />;
}
