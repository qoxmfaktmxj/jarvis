import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getSearchAnalytics } from '@/lib/queries/admin';
import { SearchAnalyticsDashboard } from '@/components/admin/SearchAnalyticsDashboard';
import { PageHeader } from '@/components/patterns/PageHeader';

export default async function SearchAnalyticsPage() {
  const t = await getTranslations('Admin.SearchAnalytics');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const data        = await getSearchAnalytics(session!.workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Search Analytics"
        title={t('title')}
        description={t('description')}
      />
      <SearchAnalyticsDashboard data={data} />
    </div>
  );
}
