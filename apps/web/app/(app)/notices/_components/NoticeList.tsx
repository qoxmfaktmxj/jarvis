import type { Notice } from '@/lib/queries/notices';
import { NoticeListItem } from './NoticeListItem';

interface NoticeListProps {
  notices: Notice[];
  emptyLabel: string;
  pinnedLabel: string;
  publishedAtLabel: string;
}

export function NoticeList({
  notices,
  emptyLabel,
  pinnedLabel,
  publishedAtLabel,
}: NoticeListProps) {
  if (notices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="notice-list-empty">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="notice-list">
      {notices.map((notice) => (
        <NoticeListItem
          key={notice.id}
          notice={notice}
          pinnedLabel={pinnedLabel}
          publishedAtLabel={publishedAtLabel}
        />
      ))}
    </ul>
  );
}
