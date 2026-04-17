// apps/web/components/search/ResultCard.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { SearchHit } from '@jarvis/search/types';

interface ResultCardProps {
  hit: SearchHit;
}

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC: 'bg-green-100 text-green-800',
  INTERNAL: 'bg-blue-100 text-blue-800',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-800',
  SECRET_REF_ONLY: 'bg-red-100 text-red-800',
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  WIKI: '위키',
  RUNBOOK: '런북',
  MEETING_NOTE: '회의록',
  DECISION: '의사결정',
  POSTMORTEM: '포스트모텀',
  REFERENCE: '참고자료',
};

export function ResultCard({ hit }: ResultCardProps) {
  const updatedAgo = formatDistanceToNow(new Date(hit.updatedAt), {
    addSuffix: true,
    locale: ko,
  });

  return (
    <article className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Title */}
          <Link
            href={hit.url}
            className="line-clamp-1 text-base font-semibold text-foreground group-hover:text-primary"
          >
            {hit.title}
          </Link>

          {/* Headline snippet with highlighted terms */}
          {hit.headline && (
            <p
              className="mt-1 line-clamp-3 text-sm text-muted-foreground [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:text-foreground"
              // ts_headline is sanitized server-side — only <mark> tags remain
              dangerouslySetInnerHTML={{ __html: hit.headline }}
            />
          )}
        </div>

        {/* Relevance score indicator (subtle) */}
        <div className="shrink-0 text-xs text-muted-foreground/50" aria-hidden>
          {(hit.hybridScore * 100).toFixed(0)}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hit.pageType && (
          <Badge variant="secondary" className="text-xs">
            {PAGE_TYPE_LABELS[hit.pageType] ?? hit.pageType}
          </Badge>
        )}
        {hit.sensitivity && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              SENSITIVITY_COLORS[hit.sensitivity] ?? 'bg-surface-100 text-surface-800'
            }`}
          >
            {hit.sensitivity}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>
    </article>
  );
}
