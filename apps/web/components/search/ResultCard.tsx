// apps/web/components/search/ResultCard.tsx
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileText, BookOpen, MessageSquare, GitBranch, AlertTriangle, Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SearchHit } from '@jarvis/search/types';

interface ResultCardProps {
  hit: SearchHit;
}

const SENSITIVITY_META: Record<
  string,
  { label: string; className: string }
> = {
  PUBLIC: { label: 'Public', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  INTERNAL: { label: 'Internal', className: 'bg-(--brand-primary-bg) text-(--brand-primary-text) ring-1 ring-inset ring-(--brand-primary)/20' },
  CONFIDENTIAL: { label: 'Confidential', className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20' },
  SECRET_REF_ONLY: { label: 'Secret', className: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' },
};

const PAGE_TYPE_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  WIKI: { label: '위키', Icon: BookOpen },
  RUNBOOK: { label: '런북', Icon: GitBranch },
  MEETING_NOTE: { label: '회의록', Icon: MessageSquare },
  DECISION: { label: '의사결정', Icon: Bookmark },
  POSTMORTEM: { label: '포스트모텀', Icon: AlertTriangle },
  REFERENCE: { label: '참고자료', Icon: FileText },
};

export function ResultCard({ hit }: ResultCardProps) {
  const updatedAgo = formatDistanceToNow(new Date(hit.updatedAt), {
    addSuffix: true,
    locale: ko,
  });

  const pageTypeMeta = hit.pageType ? PAGE_TYPE_META[hit.pageType] : undefined;
  const PageIcon = pageTypeMeta?.Icon ?? FileText;
  const sensitivityMeta = hit.sensitivity ? SENSITIVITY_META[hit.sensitivity] : undefined;

  return (
    <article className="group relative rounded-md border border-(--border-default) bg-white p-4 transition-all hover:-translate-y-[1px] hover:ring-1 hover:ring-(--brand-primary)/20 hover:shadow-[0_6px_20px_-8px_rgba(28,77,167,0.18)]">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--bg-surface) text-(--fg-secondary) ring-1 ring-inset ring-(--border-default) group-hover:bg-(--brand-primary-bg) group-hover:text-(--brand-primary) group-hover:ring-(--brand-primary)/20">
          <PageIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          {/* Breadcrumb / url */}
          <p className="text-display truncate text-[11px] text-(--fg-muted)">
            {prettifyUrl(hit.url)}
          </p>

          {/* Title */}
          <Link
            href={hit.url}
            className="mt-0.5 block text-[15px] font-semibold text-(--fg-primary) decoration-(--brand-primary) decoration-2 underline-offset-4 group-hover:text-(--brand-primary) group-hover:underline"
          >
            <span className="line-clamp-1">{hit.title}</span>
          </Link>

          {/* Headline snippet with highlighted terms */}
          {hit.headline && (
            <p
              className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-(--fg-secondary) [&_mark]:rounded [&_mark]:bg-(--brand-primary-bg) [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:font-medium [&_mark]:text-(--brand-primary-text)"
              // ts_headline is sanitized server-side — only <mark> tags remain
              dangerouslySetInnerHTML={{ __html: hit.headline }}
            />
          )}

          {/* Meta row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pageTypeMeta && (
              <Badge variant="secondary" className="h-5 gap-1 px-2 text-[11px] font-medium">
                <PageIcon className="h-3 w-3" />
                {pageTypeMeta.label}
              </Badge>
            )}
            {sensitivityMeta && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sensitivityMeta.className}`}
              >
                {sensitivityMeta.label}
              </span>
            )}
            <span className="text-display text-[11px] text-(--fg-muted) tabular-nums">
              {updatedAgo}
            </span>
          </div>
        </div>

        {/* Relevance score indicator */}
        <div
          className="text-display shrink-0 rounded-md bg-(--bg-surface) px-2 py-1 text-[10px] font-semibold tabular-nums text-(--fg-secondary) ring-1 ring-inset ring-(--border-default)"
          aria-hidden
          title="관련도 점수"
        >
          {(hit.hybridScore * 100).toFixed(0)}
        </div>
      </div>
    </article>
  );
}

function prettifyUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/').filter(Boolean).slice(0, 4);
  return parts.join(' / ');
}
