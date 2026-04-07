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
        // Toggle off: remove filter
        params.delete(key);
      } else {
        params.set(key, value);
      }

      // Reset to page 1 when filter changes
      params.delete('page');
      router.push(`/search?${params.toString()}`);
    },
    [router, searchParams, baseQuery],
  );

  const hasPageTypeFacets = Object.keys(facets.byPageType).length > 0;
  const hasSensitivityFacets = Object.keys(facets.bySensitivity).length > 0;

  if (!hasPageTypeFacets && !hasSensitivityFacets) return null;

  return (
    <aside className="space-y-4">
      {hasPageTypeFacets && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Page Type
          </p>
          <div className="flex flex-wrap gap-2">
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
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sensitivity
          </p>
          <div className="flex flex-wrap gap-2">
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
