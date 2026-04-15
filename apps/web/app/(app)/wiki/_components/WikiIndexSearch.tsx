'use client';

import { useMemo, useState } from 'react';
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
  confidential: 'destructive',
};

type WikiIndexSearchProps = {
  pages: WikiPageMeta[];
  workspaceId: string;
};

export function WikiIndexSearch({ pages, workspaceId }: WikiIndexSearchProps) {
  const t = useTranslations('Wiki');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((page) => {
      const haystack = [page.title, page.slug, ...page.tags].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [pages, query]);

  return (
    <div className="space-y-6">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search')}
        className="max-w-md"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{t('noResults')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((page) => (
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
                  <p className="text-xs text-gray-400 font-mono">{page.slug}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {page.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {t('lastUpdated')}:{' '}
                    {new Date(page.updatedAt).toLocaleDateString('ko-KR')}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
