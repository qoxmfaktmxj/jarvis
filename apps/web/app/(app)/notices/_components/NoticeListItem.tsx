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
      className="rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
    >
      <Link href={`/notices/${notice.id}`} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {notice.pinned && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pinnedLabel}
            </span>
          )}
          <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
            {notice.sensitivity}
          </span>
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {notice.title}
          </h2>
        </div>
        <div className="text-xs text-gray-500">
          {publishedAtLabel}: {formatDate(notice.publishedAt)}
        </div>
      </Link>
    </li>
  );
}
