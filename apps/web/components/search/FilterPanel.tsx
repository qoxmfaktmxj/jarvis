'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { FacetBadge } from './FacetBadge';
import type { SearchFacets } from '@jarvis/search/types';

interface FilterPanelProps {
  facets: SearchFacets;
  baseQuery: string;
}

export function FilterPanel({ facets, baseQuery }: FilterPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activePageType = searchParams.get('pageType') ?? '';
  const activeSensitivity = searchParams.get('sensitivity') ?? '';

  const applyFilter = useCallback(
    (key: 'pageType' | 'sensitivity', value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', baseQuery);

      if (params.get(key) === value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      params.delete('page');
      router.push(`/search?${params.toString()}`);
    },
    [router, searchParams, baseQuery],
  );

  const hasPageTypeFacets = Object.keys(facets.byPageType).length > 0;
  const hasSensitivityFacets = Object.keys(facets.bySensitivity).length > 0;

  if (!hasPageTypeFacets && !hasSensitivityFacets) return null;

  const hasAnyActive = activePageType || activeSensitivity;

  return (
    <aside className="sticky top-6 space-y-5 rounded-md border border-surface-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between">
        <p className="text-display text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-500">
          필터
        </p>
        {hasAnyActive && (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set('q', baseQuery);
              router.push(`/search?${params.toString()}`);
            }}
            className="text-[11px] font-medium text-isu-600 hover:text-isu-700"
          >
            초기화
          </button>
        )}
      </div>

      {hasPageTypeFacets && (
        <div>
          <p className="mb-2 text-[11px] font-semibold text-surface-700">문서 종류</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(facets.byPageType).map(([type, count]) => (
              <FacetBadge
                key={type}
                label={type}
                count={count}
                active={activePageType === type}
                onClick={() => applyFilter('pageType', type)}
              />
            ))}
          </div>
        </div>
      )}

      {hasSensitivityFacets && (
        <div>
          <p className="mb-2 text-[11px] font-semibold text-surface-700">보안 등급</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(facets.bySensitivity).map(([sens, count]) => (
              <FacetBadge
                key={sens}
                label={sens}
                count={count}
                active={activeSensitivity === sens}
                onClick={() => applyFilter('sensitivity', sens)}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
