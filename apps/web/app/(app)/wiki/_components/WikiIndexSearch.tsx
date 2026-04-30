'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, Loader2, X, FileText, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { mapDbSensitivity, type WikiPageMeta } from '@/components/WikiPageView';
import { useWikiPanel } from '@/components/ai/WikiPanelContext';
import { cn } from '@/lib/utils';

const SENSITIVITY_STYLES: Record<
  WikiPageMeta['sensitivity'],
  { dot: string; chip: string; label: string }
> = {
  public: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    label: 'Public',
  },
  internal: {
    dot: 'bg-isu-500',
    chip: 'bg-isu-50 text-isu-700 ring-isu-500/20',
    label: 'Internal',
  },
  restricted: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    label: 'Restricted',
  },
  secret: {
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 ring-red-600/20',
    label: 'Secret',
  },
};

type WikiIndexSearchProps = {
  pages: WikiPageMeta[];
  workspaceId: string;
  total: number;
  currentPage: number;
  totalPages: number;
};

const DEBOUNCE_MS = 300;

export function WikiIndexSearch({
  pages: initialPages,
  workspaceId,
  total,
  currentPage,
  totalPages,
}: WikiIndexSearchProps) {
  const t = useTranslations('Wiki');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WikiPageMeta[]>(initialPages);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<WikiPageMeta['sensitivity'] | 'all'>('all');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      abortRef.current?.abort();
      setResults(initialPages);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(
        `/api/wiki/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(
          (data: {
            pages: Array<{ slug: string; title: string; routeKey?: string; sensitivity?: string }>;
          }) => {
            const mapped: WikiPageMeta[] = (data.pages ?? []).map((r) => ({
              slug: r.routeKey ?? r.slug,
              title: r.title,
              sensitivity: mapDbSensitivity(r.sensitivity ?? 'INTERNAL'),
              tags: [],
              updatedAt: '',
              workspaceId,
            }));
            setResults(mapped);
            setIsSearching(false);
          },
        )
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setIsSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query, workspaceId, initialPages]);

  // Facet counts (over current results)
  const facets = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of results) counts[p.sensitivity] = (counts[p.sensitivity] ?? 0) + 1;
    return counts;
  }, [results]);

  const filtered = useMemo(
    () => (activeFilter === 'all' ? results : results.filter((p) => p.sensitivity === activeFilter)),
    [results, activeFilter],
  );

  const SENS_KEYS: WikiPageMeta['sensitivity'][] = ['public', 'internal', 'restricted', 'secret'];

  return (
    <div className="space-y-5">
      {/* Search + filter row — 같은 행에서 폭 공유. 검색은 grow + max-cap, 필터는 shrink-0. */}
      <div className="flex flex-nowrap items-center gap-3">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            className="h-10 rounded-md border-surface-200 bg-white pl-10 pr-10 text-[14px] placeholder:text-surface-400 focus-visible:border-isu-500 focus-visible:ring-isu-200"
          />
          {isSearching ? (
            <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-surface-400" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="ml-auto inline-flex shrink-0 rounded-md bg-surface-100 p-0.5 ring-1 ring-inset ring-surface-200">
          <FilterTab
            active={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
            label="전체"
            count={results.length}
          />
          {SENS_KEYS.map((sens) =>
            facets[sens] ? (
              <FilterTab
                key={sens}
                active={activeFilter === sens}
                onClick={() => setActiveFilter(sens)}
                label={t(`sensitivity.${sens}`)}
                count={facets[sens]}
                dotClass={SENSITIVITY_STYLES[sens].dot}
              />
            ) : null,
          )}
        </div>
      </div>

      {/* Result summary */}
      <p className="text-display text-[11px] tabular-nums text-surface-500">
        {query ? (
          <>
            {filtered.length}
            <span className="text-surface-300"> / </span>
            {results.length} 페이지
            <span className="mx-1.5 text-surface-300">·</span>
            <span>“{query}”</span>
          </>
        ) : (
          <>
            {filtered.length}
            <span className="text-surface-300"> / </span>
            {t('total', { count: total })}
            <span className="mx-1.5 text-surface-300">·</span>
            {t('pagination.page', { page: currentPage, total: totalPages })}
          </>
        )}
      </p>

      {/* Results */}
      {isSearching ? (
        <div className="flex items-center gap-2 text-sm text-surface-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          검색 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-surface-200 bg-surface-50/60 px-6 py-14 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-surface-200">
            <FileText className="h-4 w-4 text-surface-500" />
          </div>
          <p className="mt-3 text-[14px] font-semibold text-surface-800">{t('noResults')}</p>
          <p className="mt-1 text-[12px] text-surface-500">{t('noResultsHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((page) => (
            <WikiPageRow key={page.slug} page={page} workspaceId={workspaceId} t={t} />
          ))}
        </div>
      )}

      {/* Pagination (hidden when searching) */}
      {!query.trim() && totalPages > 1 && (
        <WikiPagination
          currentPage={currentPage}
          totalPages={totalPages}
          previousLabel={t('pagination.previous')}
          nextLabel={t('pagination.next')}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type PageItem = number | 'ellipsis-left' | 'ellipsis-right';

function buildPageItems(current: number, total: number, siblings = 1): PageItem[] {
  // first + last + current + 2*siblings + 2 ellipsis placeholders
  const totalSlots = siblings * 2 + 5;
  if (total <= totalSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblings, 1);
  const rightSibling = Math.min(current + siblings, total);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftCount = 3 + 2 * siblings;
    const left = Array.from({ length: leftCount }, (_, i) => i + 1);
    return [...left, 'ellipsis-right', total];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + 2 * siblings;
    const right = Array.from({ length: rightCount }, (_, i) => total - rightCount + 1 + i);
    return [1, 'ellipsis-left', ...right];
  }
  const middle = Array.from(
    { length: rightSibling - leftSibling + 1 },
    (_, i) => leftSibling + i,
  );
  return [1, 'ellipsis-left', ...middle, 'ellipsis-right', total];
}

function WikiPagination({
  currentPage,
  totalPages,
  previousLabel,
  nextLabel,
}: {
  currentPage: number;
  totalPages: number;
  previousLabel: string;
  nextLabel: string;
}) {
  const items = buildPageItems(currentPage, totalPages);
  const hrefFor = (page: number) => `/wiki?page=${page}`;
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className="mt-4 flex w-full items-center justify-center border-t border-surface-200 pt-5"
    >
      <ul className="flex flex-row items-center gap-1">
        <li>
          <PaginationArrow
            direction="prev"
            href={prevDisabled ? null : hrefFor(currentPage - 1)}
            label={previousLabel}
          />
        </li>

        {items.map((item, idx) => {
          if (item === 'ellipsis-left' || item === 'ellipsis-right') {
            return (
              <li key={`${item}-${idx}`}>
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center text-surface-400"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More pages</span>
                </span>
              </li>
            );
          }
          const active = item === currentPage;
          return (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-current={active ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={cn(
                  buttonVariants({ variant: active ? 'outline' : 'ghost', size: 'icon' }),
                  'text-display h-9 w-9 rounded-md text-[13px] tabular-nums transition-colors',
                  active
                    ? 'border-isu-300 bg-isu-50 text-isu-700 hover:bg-isu-50 hover:text-isu-700'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900',
                )}
              >
                {item}
              </Link>
            </li>
          );
        })}

        <li>
          <PaginationArrow
            direction="next"
            href={nextDisabled ? null : hrefFor(currentPage + 1)}
            label={nextLabel}
          />
        </li>
      </ul>
    </nav>
  );
}

function PaginationArrow({
  direction,
  href,
  label,
}: {
  direction: 'prev' | 'next';
  href: string | null;
  label: string;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  const classes = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'h-9 gap-1 rounded-md px-2.5 text-[13px] font-medium transition-colors',
    href
      ? 'text-surface-700 hover:bg-surface-100 hover:text-surface-900'
      : 'pointer-events-none text-surface-300',
  );
  const content = (
    <>
      {direction === 'prev' && <Icon className="h-4 w-4" aria-hidden />}
      <span>{label}</span>
      {direction === 'next' && <Icon className="h-4 w-4" aria-hidden />}
    </>
  );
  return href ? (
    <Link href={href} className={classes} aria-label={label}>
      {content}
    </Link>
  ) : (
    <span className={classes} aria-disabled="true" aria-label={label}>
      {content}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function FilterTab({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'bg-white text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
          : 'text-surface-600 hover:text-surface-900',
      )}
    >
      {dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden />}
      {label}
      <span
        className={cn(
          'text-display rounded px-1 text-[10px] tabular-nums',
          active ? 'bg-surface-100 text-surface-600' : 'text-surface-400',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function WikiPageRow({
  page,
  workspaceId,
  t,
}: {
  page: WikiPageMeta;
  workspaceId: string;
  t: ReturnType<typeof useTranslations<'Wiki'>>;
}) {
  const sens = SENSITIVITY_STYLES[page.sensitivity] ?? SENSITIVITY_STYLES.internal;
  const panel = useWikiPanel();
  const isActive = panel.hasProvider && panel.active?.slug === page.slug;

  // lg 미만에서는 Link 기본 navigate를 그대로 두고, lg 이상이면 우측 패널로 intercept.
  // 같은 카드를 다시 누르면 패널 close(toggle).
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!panel.hasProvider) return;
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    e.preventDefault();
    if (panel.active?.slug === page.slug) {
      panel.close();
    } else {
      panel.open({ slug: page.slug });
    }
  };

  return (
    <Link
      href={`/wiki/${workspaceId}/${page.slug}`}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      data-active={isActive ? 'true' : undefined}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-md border bg-white px-4 py-2.5 transition-all',
        isActive
          ? 'border-isu-400 bg-isu-50/40 shadow-[0_4px_14px_-8px_rgba(28,77,167,0.25)]'
          : 'border-surface-200 hover:border-isu-200 hover:shadow-[0_4px_14px_-8px_rgba(28,77,167,0.18)]',
      )}
    >
      {/* Sensitivity accent stripe */}
      <span
        className={cn('absolute left-0 top-0 h-full w-[2px]', sens.dot)}
        aria-hidden
      />

      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
          isActive
            ? 'bg-isu-50 text-isu-600 ring-isu-200'
            : 'bg-surface-50 text-surface-500 ring-surface-200 group-hover:bg-isu-50 group-hover:text-isu-600 group-hover:ring-isu-200',
        )}
      >
        <FileText className="h-3.5 w-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h3
          className={cn(
            'truncate text-[14px] font-semibold transition-colors',
            isActive ? 'text-isu-700' : 'text-surface-900 group-hover:text-isu-700',
          )}
        >
          {page.title}
        </h3>
        <span className="text-display hidden truncate text-[11px] text-surface-400 sm:inline">
          {page.slug}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {page.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="hidden items-center rounded-full bg-surface-50 px-2 py-0.5 text-[10px] font-medium text-surface-600 ring-1 ring-inset ring-surface-200 md:inline-flex"
          >
            #{tag}
          </span>
        ))}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
            sens.chip,
          )}
        >
          {t(`sensitivity.${page.sensitivity}`)}
        </span>
        {page.updatedAt && (
          <span className="text-display text-[11px] tabular-nums text-surface-400">
            {new Date(page.updatedAt).toLocaleDateString('ko-KR', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>
    </Link>
  );
}
