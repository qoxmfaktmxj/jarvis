// apps/web/app/(app)/search/page.tsx
import { Suspense } from 'react';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { executeSearch } from '@/lib/queries/search';
import { SearchPage } from '@/components/search/SearchPage';
import { SearchBar } from '@/components/search/SearchBar';
import { PageHeader } from '@/components/patterns/PageHeader';
import type { SearchSortBy } from '@jarvis/search/types';

export const dynamic = 'force-dynamic';

interface SearchPageRouteProps {
  searchParams: Promise<{
    q?: string;
    pageType?: string;
    sensitivity?: string;
    sortBy?: string;
    page?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

async function SearchResults({ searchParams }: SearchPageRouteProps) {
  const params = await searchParams;
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const q = params.q?.trim() ?? '';
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10));

  if (!q) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader eyebrow="Search" title="검색" />
        <div className="mb-6">
          <SearchBar autoFocus />
        </div>
        <p className="text-center text-muted-foreground">검색어를 입력하세요</p>
      </div>
    );
  }

  // Accept legacy aliases: 'date' → 'newest', 'popularity' → 'hybrid'
  const sortAliases: Record<string, SearchSortBy> = { date: 'newest', popularity: 'hybrid' };
  const rawSort = params.sortBy ?? '';
  const validSortBy: SearchSortBy = ['relevance', 'newest', 'freshness', 'hybrid'].includes(rawSort)
    ? (rawSort as SearchSortBy)
    : sortAliases[rawSort] ?? 'relevance';

  const result = await executeSearch({
    q,
    workspaceId: session.workspaceId,
    userId: session.userId,
    userRoles: session.roles ?? [],
    userPermissions: session.permissions ?? [],
    pageType: params.pageType,
    sensitivity: params.sensitivity,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    sortBy: validSortBy,
    page: currentPage,
    limit: 20,
  });

  return (
    <SearchPage
      result={result}
      currentQuery={q}
      currentPage={currentPage}
      pageType={params.pageType}
      sortBy={validSortBy}
    />
  );
}

export default function Page(props: SearchPageRouteProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">검색 중...</div>}>
      <SearchResults {...props} />
    </Suspense>
  );
}

export const metadata = {
  title: '검색 | Jarvis',
};
