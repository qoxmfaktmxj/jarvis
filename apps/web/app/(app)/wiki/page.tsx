import { getTranslations } from 'next-intl/server';
// Phase-W2 TODO: replace with real wiki_page_index query.
// MOCK_WIKI_PAGES 는 더 이상 index.ts 에서 re-export 되지 않으므로 fixture 파일을 직접 import.
import { MOCK_WIKI_PAGES } from '@/components/WikiPageView/mockWikiPages';
import { PageHeader } from '@/components/patterns/PageHeader';
import { WikiIndexSearch } from './_components/WikiIndexSearch';

export const dynamic = 'force-dynamic';
export const metadata = { title: '위키' };

const DEFAULT_WORKSPACE_ID = 'default';

export default async function WikiHomePage() {
  const t = await getTranslations('Wiki');

  const pages = MOCK_WIKI_PAGES.map(({ content: _content, ...meta }) => meta);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader eyebrow="Wiki" title={t('title')} />

      <WikiIndexSearch pages={pages} workspaceId={DEFAULT_WORKSPACE_ID} />
    </div>
  );
}
