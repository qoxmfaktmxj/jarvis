import { getTranslations } from 'next-intl/server';
import { BookOpen } from 'lucide-react';
import { MOCK_WIKI_PAGES } from '@/components/WikiPageView';
import { WikiIndexSearch } from './_components/WikiIndexSearch';

export const dynamic = 'force-dynamic';
export const metadata = { title: '위키' };

const DEFAULT_WORKSPACE_ID = 'default';

export default async function WikiHomePage() {
  const t = await getTranslations('Wiki');

  const pages = MOCK_WIKI_PAGES.map(({ content: _content, ...meta }) => meta);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" /> {t('title')}
        </h1>
      </div>

      <WikiIndexSearch pages={pages} workspaceId={DEFAULT_WORKSPACE_ID} />
    </div>
  );
}
