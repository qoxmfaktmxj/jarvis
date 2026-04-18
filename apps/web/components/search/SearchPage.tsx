// apps/web/components/search/SearchPage.tsx
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { ResultCard } from './ResultCard';
import { Button } from '@/components/ui/button';
import { Capy } from '@/components/layout/Capy';
import type { SearchResult } from '@jarvis/search/types';

interface SearchPageProps {
  result: SearchResult;
  currentQuery: string;
  currentPage: number;
  pageType?: string;
  sortBy?: string;
}

const LIMIT = 20;

const SORT_OPTIONS: { value: 'relevance' | 'newest' | 'hybrid'; label: string; desc: string }[] = [
  { value: 'relevance', label: '관련도', desc: 'BM25 점수 기준' },
  { value: 'newest', label: '최신순', desc: '업데이트 시각' },
  { value: 'hybrid', label: '하이브리드', desc: '의미 + 키워드' },
];

export function SearchPage({
  result,
  currentQuery,
  currentPage,
  pageType,
  sortBy,
}: SearchPageProps) {
  const totalPages = Math.ceil(result.total / LIMIT);
  const hasResults = result.hits.length > 0;
  const activeSort = sortBy ?? 'relevance';

  function buildPageUrl(page: number) {
    const params = new URLSearchParams();
    params.set('q', currentQuery);
    if (pageType) params.set('pageType', pageType);
    if (sortBy) params.set('sortBy', sortBy);
    params.set('page', String(page));
    return `/search?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Search bar */}
      <div className="mb-8">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary focus target on mount */}
        <SearchBar defaultValue={currentQuery} autoFocus={!currentQuery} />
      </div>

      {/* Results summary */}
      {currentQuery && (
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-surface-200 pb-3">
          <h1 className="text-[15px] font-semibold text-surface-900">
            <span className="text-surface-500">“</span>
            {currentQuery}
            <span className="text-surface-500">”</span>
          </h1>
          {hasResults ? (
            <p className="text-display text-[12px] text-surface-500 tabular-nums">
              결과 <span className="font-semibold text-surface-800">{result.total.toLocaleString()}</span>건
              <span className="mx-1.5 text-surface-300">·</span>
              {result.durationMs}ms
            </p>
          ) : (
            <p className="text-display text-[12px] text-surface-500">결과 없음</p>
          )}
        </div>
      )}

      <div className="flex gap-6">
        {/* Filter sidebar */}
        {hasResults && (
          <div className="w-56 shrink-0">
            <FilterPanel facets={result.facets} baseQuery={currentQuery} />
          </div>
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {hasResults ? (
            <>
              {/* Sort controls — segmented */}
              <div className="mb-4 flex items-center justify-between">
                <div
                  role="radiogroup"
                  aria-label="정렬"
                  className="inline-flex rounded-md bg-surface-100 p-0.5 ring-1 ring-inset ring-surface-200"
                >
                  {SORT_OPTIONS.map((opt) => {
                    const active = activeSort === opt.value;
                    return (
                      <Link
                        key={opt.value}
                        href={`/search?q=${encodeURIComponent(currentQuery)}&sortBy=${opt.value}`}
                        role="radio"
                        aria-checked={active}
                        title={opt.desc}
                        className={
                          active
                            ? 'rounded-[5px] bg-white px-3 py-1 text-[12px] font-semibold text-isu-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                            : 'rounded-[5px] px-3 py-1 text-[12px] font-medium text-surface-600 hover:text-surface-900'
                        }
                      >
                        {opt.label}
                      </Link>
                    );
                  })}
                </div>
                <p className="text-display text-[11px] text-surface-400 tabular-nums">
                  {(currentPage - 1) * LIMIT + 1}–
                  {Math.min(currentPage * LIMIT, result.total)} / {result.total.toLocaleString()}
                </p>
              </div>

              {/* Result list */}
              <div className="space-y-2.5">
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
                  <span className="text-display px-3 text-[12px] font-medium tabular-nums text-surface-600">
                    {currentPage}
                    <span className="mx-1 text-surface-300">/</span>
                    {totalPages}
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
          ) : currentQuery ? (
            <EmptyState query={currentQuery} suggestions={result.suggestions} />
          ) : (
            <InitialState />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState({ query, suggestions }: { query: string; suggestions: string[] }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-200 bg-surface-50/60 px-6 py-16 text-center">
      <Capy name="surprise" size={140} />
      <p className="mt-4 text-[15px] font-semibold text-surface-900">
        “{query}”에 대한 결과가 없습니다
      </p>
      <p className="mt-1 text-[13px] text-surface-500">
        철자를 확인하거나 다른 키워드를 시도해 보세요.
      </p>

      {suggestions.length > 0 && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-display mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-400">
            추천 검색어
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {suggestions.map((s) => (
              <Link
                key={s}
                href={`/search?q=${encodeURIComponent(s)}`}
                className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-isu-700 ring-1 ring-inset ring-isu-200 transition-colors hover:bg-isu-50"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InitialState() {
  const QUICK = ['온보딩 체크리스트', 'API 인증', '보안 등급', '배포 런북', '회의록 템플릿'];
  return (
    <div className="rounded-md border border-dashed border-surface-200 bg-surface-50/60 p-10 text-center">
      <p className="text-[14px] font-semibold text-surface-800">무엇을 찾고 계신가요?</p>
      <p className="mt-1 text-[13px] text-surface-500">
        위키·런북·회의록·코드를 하나의 검색창에서.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-1.5">
        {QUICK.map((q) => (
          <Link
            key={q}
            href={`/search?q=${encodeURIComponent(q)}`}
            className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-surface-700 ring-1 ring-inset ring-surface-200 hover:bg-isu-50 hover:text-isu-700 hover:ring-isu-200"
          >
            {q}
          </Link>
        ))}
      </div>
    </div>
  );
}
