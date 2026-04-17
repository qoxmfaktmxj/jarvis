// apps/web/components/ai/ClaimBadge.tsx
'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Link from 'next/link';
import type { SourceRef } from '@jarvis/ai/types';

interface ClaimBadgeProps {
  sourceNumber: number; // 1-based, matches [source:N] in text
  sources: SourceRef[];
}

/** SourceRef 종류에 따라 tooltip 레이블/상세 및 URL을 추출 */
function getSourceMeta(source: SourceRef): {
  label: string;
  hoverTitle: string;
  hoverDetail: string | null;
  href: string | null;
  colorClass: string;
} {
  switch (source.kind) {
    case 'text':
      return {
        label: '',         // 숫자만 (호출 측에서 sourceNumber 표시)
        hoverTitle: source.title,
        hoverDetail: source.excerpt,
        href: source.url,
        colorClass:
          'inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold hover:bg-primary/25 transition-colors',
      };
    case 'graph':
      return {
        label: 'G',
        hoverTitle: `Graph: ${source.nodeLabel}`,
        hoverDetail: source.snapshotTitle,
        href: source.url,
        colorClass:
          'inline-flex items-center justify-center rounded-full bg-isu-100 px-1 text-isu-700 text-[10px] font-bold hover:bg-isu-200 transition-colors',
      };
    case 'case':
      return {
        label: 'C',
        hoverTitle: `사례: ${source.title}`,
        hoverDetail: source.symptom,
        href: null,
        colorClass:
          'inline-flex items-center justify-center rounded-full bg-warning-subtle px-1 text-warning text-[10px] font-bold transition-colors',
      };
    case 'directory':
      return {
        label: 'D',
        hoverTitle: source.nameKo ?? source.name,
        hoverDetail: source.ownerTeam ?? null,
        href: source.url,
        colorClass:
          'inline-flex items-center justify-center rounded-full bg-success-subtle px-1 text-success text-[10px] font-bold transition-colors',
      };
    case 'wiki-page':
      return {
        label: 'W',
        hoverTitle: source.title,
        hoverDetail: `${source.citation} · ${source.path}`,
        href: `/wiki/default/${encodeURIComponent(source.slug)}`,
        colorClass:
          'inline-flex items-center justify-center rounded-full bg-lime-100 px-1 text-lime-700 text-[10px] font-bold hover:bg-lime-200 transition-colors',
      };
  }
}

export function ClaimBadge({ sourceNumber, sources }: ClaimBadgeProps) {
  const source = sources[sourceNumber - 1];

  if (!source) {
    return (
      <sup className="text-xs text-muted-foreground">[{sourceNumber}]</sup>
    );
  }

  const { label, hoverTitle, hoverDetail, href, colorClass } = getSourceMeta(source);
  const displayLabel = label ? `${label}${sourceNumber}` : String(sourceNumber);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup>
            {href ? (
              <Link
                href={href}
                className={colorClass}
                {...(source.kind === 'directory' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {displayLabel}
              </Link>
            ) : (
              <span className={colorClass}>{displayLabel}</span>
            )}
          </sup>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium text-xs">{hoverTitle}</p>
          {hoverDetail && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {hoverDetail}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
