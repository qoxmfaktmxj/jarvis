// apps/web/components/ai/ClaimBadge.tsx
// Inline citation badge — superscript number/letter rendered in the accent
// color of its source kind. Consistent typography; no full-color fills.
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

/** SourceRef → inline badge metadata.
 *  All kinds share one visual shape (tiny pill, hairline border, tabular label);
 *  only the text color shifts with the kind so inline citations remain
 *  unobtrusive inside a paragraph. */
function getSourceMeta(source: SourceRef): {
  letter: string | '';
  hoverTitle: string;
  hoverDetail: string | null;
  href: string | null;
  textClass: string;
} {
  switch (source.kind) {
    case 'text':
      return {
        letter: '',
        hoverTitle: source.title,
        hoverDetail: source.excerpt,
        href: source.url,
        textClass: 'text-(--brand-primary-text) hover:text-(--brand-primary-text)',
      };
    case 'graph':
      return {
        letter: 'G',
        hoverTitle: `Graph · ${source.nodeLabel}`,
        hoverDetail: source.snapshotTitle,
        href: source.url,
        textClass: 'text-(--brand-primary-text) hover:text-(--brand-primary-text)',
      };
    case 'case':
      return {
        letter: 'C',
        hoverTitle: `사례 · ${source.title}`,
        hoverDetail: source.symptom,
        href: null,
        textClass: 'text-(--fg-primary)',
      };
    case 'directory':
      return {
        letter: 'D',
        hoverTitle: source.nameKo ?? source.name,
        hoverDetail: source.ownerTeam ?? null,
        href: source.url,
        textClass: 'text-(--fg-primary) hover:text-(--fg-primary)',
      };
    case 'wiki-page':
      return {
        letter: 'W',
        hoverTitle: source.title,
        hoverDetail: `${source.citation} · ${source.path}`,
        href: `/wiki/default/${encodeURIComponent(source.slug)}`,
        textClass: 'text-(--brand-primary-text) hover:text-(--brand-primary-text)',
      };
  }
}

export function ClaimBadge({ sourceNumber, sources }: ClaimBadgeProps) {
  const source = sources[sourceNumber - 1];

  if (!source) {
    return <sup className="text-[10px] text-(--fg-muted)">[{sourceNumber}]</sup>;
  }

  const { letter, hoverTitle, hoverDetail, href, textClass } = getSourceMeta(source);
  const display = letter ? `${letter}${sourceNumber}` : String(sourceNumber);

  const pillCls = `text-display mx-0.5 inline-flex h-[14px] items-center rounded-[3px] border border-(--border-default) bg-card px-1 align-[1px] text-[10px] font-semibold leading-none tabular-nums transition-colors duration-150 ${textClass} hover:border-current`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup>
            {href ? (
              <Link
                href={href}
                className={pillCls}
                {...(source.kind === 'directory' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {display}
              </Link>
            ) : (
              <span className={pillCls}>{display}</span>
            )}
          </sup>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">{hoverTitle}</p>
          {hoverDetail ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {hoverDetail}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
