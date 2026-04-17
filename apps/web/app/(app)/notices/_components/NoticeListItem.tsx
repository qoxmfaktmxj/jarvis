import Link from 'next/link';
import type { Notice } from '@/lib/queries/notices';

interface NoticeListItemProps {
  notice: Notice;
  pinnedLabel: string;
  publishedAtLabel: string;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NoticeListItem({
  notice,
  pinnedLabel,
  publishedAtLabel,
}: NoticeListItemProps) {
  return (
    <li
      data-testid="notice-list-item"
      className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-isu-400 hover:bg-isu-50/40"
    >
      <Link href={`/notices/${notice.id}`} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {notice.pinned && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              {pinnedLabel}
            </span>
          )}
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            {notice.sensitivity}
          </span>
          <h2 className="truncate text-base font-semibold text-foreground">
            {notice.title}
          </h2>
        </div>
        <div className="text-xs text-muted-foreground">
          {publishedAtLabel}: {formatDate(notice.publishedAt)}
        </div>
      </Link>
    </li>
  );
}
