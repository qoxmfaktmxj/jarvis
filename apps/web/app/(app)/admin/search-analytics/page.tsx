import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { getSearchAnalytics } from '@/lib/queries/admin';
import { SearchAnalyticsDashboard } from '@/components/admin/SearchAnalyticsDashboard';

export default async function SearchAnalyticsPage() {
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const data        = await getSearchAnalytics(session!.workspaceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Query volume, zero-result rate, and popular search terms.
        </p>
      </div>
      <SearchAnalyticsDashboard data={data} />
    </div>
  );
}
