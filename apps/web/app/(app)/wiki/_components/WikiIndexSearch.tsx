'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WikiPageMeta } from '@/components/WikiPageView';

const SENSITIVITY_VARIANT: Record<
  WikiPageMeta['sensitivity'],
  'success' | 'warning' | 'destructive'
> = {
  public: 'success',
  internal: 'warning',
  restricted: 'warning',
  secret: 'destructive',
};

type WikiIndexSearchProps = {
  pages: WikiPageMeta[];
  workspaceId: string;
};

const DEBOUNCE_MS = 300;

export function WikiIndexSearch({ pages: initialPages, workspaceId }: WikiIndexSearchProps) {
  const t = useTranslations('Wiki');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WikiPageMeta[]>(initialPages);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    // Empty query: show server-provided initial pages
    if (!trimmed) {
      abortRef.current?.abort();
      setResults(initialPages);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(() => {
      // Abort previous in-flight request
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
        .then((data: { pages: Array<{ slug: string; title: string; routeKey?: string; sensitivity?: string }> }) => {
          const mapped: WikiPageMeta[] = (data.pages ?? []).map((r) => ({
            slug: r.routeKey ?? r.slug,
            title: r.title,
            sensitivity: (r.sensitivity ?? 'internal') as WikiPageMeta['sensitivity'],
            tags: [],
            updatedAt: '',
            workspaceId,
          }));
          setResults(mapped);
          setIsSearching(false);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setIsSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query, workspaceId, initialPages]);

  return (
    <div className="space-y-6">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search')}
        className="max-w-md"
      />

      {isSearching ? (
        <p className="text-sm text-surface-400 italic">...</p>
      ) : results.length === 0 ? (
        <div className="space-y-1">
          <p className="text-sm text-surface-400 italic">{t('noResults')}</p>
          <p className="text-xs text-surface-400">{t('noResultsHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((page) => (
            <Link
              key={page.slug}
              href={`/wiki/${workspaceId}/${page.slug}`}
              className="block"
            >
              <Card className="hover:border-blue-400 hover:shadow-sm transition-all h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{page.title}</CardTitle>
                    <Badge variant={SENSITIVITY_VARIANT[page.sensitivity]}>
                      {t(`sensitivity.${page.sensitivity}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-surface-400 font-mono">{page.slug}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {page.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {page.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {page.updatedAt && (
                    <p className="text-xs text-surface-400">
                      {t('lastUpdated')}:{' '}
                      {new Date(page.updatedAt).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
