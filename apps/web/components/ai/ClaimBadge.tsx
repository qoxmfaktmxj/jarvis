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

export function ClaimBadge({ sourceNumber, sources }: ClaimBadgeProps) {
  const source = sources[sourceNumber - 1];

  if (!source) {
    return (
      <sup className="text-xs text-muted-foreground">[{sourceNumber}]</sup>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup>
            <Link
              href={source.url}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold hover:bg-primary/25 transition-colors"
            >
              {sourceNumber}
            </Link>
          </sup>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium text-xs">{source.title}</p>
          {source.excerpt && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {source.excerpt}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
