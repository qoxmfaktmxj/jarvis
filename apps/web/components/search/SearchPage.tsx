// apps/web/components/search/SearchPage.tsx
import Link from 'next/link';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { ResultCard } from './ResultCard';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SearchResult } from '@jarvis/search/types';

interface SearchPageProps {
  result: SearchResult;
  currentQuery: string;
  currentPage: number;
  pageType?: string;
  sortBy?: string;
}

const LIMIT = 20;

export function SearchPage({
  result,
  currentQuery,
  currentPage,
  pageType,
  sortBy,
}: SearchPageProps) {
  const totalPages = Math.ceil(result.total / LIMIT);
  const hasResults = result.hits.length > 0;

  function buildPageUrl(page: number) {
    const params = new URLSearchParams();
    params.set('q', currentQuery);
    if (pageType) params.set('pageType', pageType);
    if (sortBy) params.set('sortBy', sortBy);
    params.set('page', String(page));
    return `/search?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Search bar */}
      <div className="mb-6">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary focus target on mount */}
        <SearchBar defaultValue={currentQuery} autoFocus={!currentQuery} />
      </div>

      {/* Results summary */}
      {currentQuery && (
        <p className="mb-4 text-sm text-muted-foreground">
          {hasResults
            ? `"${currentQuery}" 검색 결과 ${result.total.toLocaleString()}건 (${result.durationMs}ms)`
            : `"${currentQuery}"에 대한 결과가 없습니다`}
        </p>
      )}

      <div className="flex gap-6">
        {/* Filter sidebar */}
        {hasResults && (
          <div className="w-48 shrink-0">
            <FilterPanel facets={result.facets} baseQuery={currentQuery} />
          </div>
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {hasResults ? (
            <>
              {/* Sort controls */}
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">정렬:</span>
                {(['relevance', 'newest', 'hybrid'] as const).map((s) => (
                  <Link
                    key={s}
                    href={`/search?q=${encodeURIComponent(currentQuery)}&sortBy=${s}`}
                    className={
                      (sortBy ?? 'relevance') === s
                        ? 'font-semibold text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }
                  >
                    {{ relevance: '관련도', newest: '최신순', hybrid: '하이브리드' }[s]}
                  </Link>
                ))}
              </div>

              {/* Result list */}
              <div className="space-y-3">
                {result.hits.map((hit) => (
                  <ResultCard key={hit.id} hit={hit} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <nav
                  className="mt-8 flex items-center justify-center gap-2"
                  aria-label="페이지 탐색"
                >
                  {currentPage > 1 && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildPageUrl(currentPage - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                        이전
                      </Link>
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  {currentPage < totalPages && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildPageUrl(currentPage + 1)}>
                        다음
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </nav>
              )}
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-lg font-medium text-muted-foreground">결과 없음</p>
              {result.suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-muted-foreground">이런 검색어는 어떠세요?</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {result.suggestions.map((s) => (
                      <Link
                        key={s}
                        href={`/search?q=${encodeURIComponent(s)}`}
                        className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/80"
                      >
                        {s}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
