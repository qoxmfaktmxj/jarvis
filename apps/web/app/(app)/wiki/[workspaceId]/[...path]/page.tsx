import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MOCK_WIKI_PAGES } from '@/components/WikiPageView';
import { WikiPageWithNav } from './_components/WikiPageWithNav';

export const dynamic = 'force-dynamic';

type WikiDetailPageProps = {
  params: Promise<{ workspaceId: string; path: string[] }>;
};

export default async function WikiDetailPage({ params }: WikiDetailPageProps) {
  const { workspaceId, path } = await params;
  const slug = path.join('/');

  const page = MOCK_WIKI_PAGES.find(
    (p) => p.slug === slug && p.workspaceId === workspaceId,
  );

  if (!page) {
    notFound();
  }

  // sensitivity 권한 필터 (mock): confidential 페이지는 접근 거부
  if (page.sensitivity === 'confidential') {
    const t = await getTranslations('Wiki');
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t('accessDenied')}</h1>
        <p className="text-sm text-gray-500">{page.slug}</p>
      </div>
    );
  }

  return <WikiPageWithNav page={page} workspaceId={workspaceId} />;
}
