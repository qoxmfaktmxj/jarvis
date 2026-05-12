import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getNoticeById } from '@/lib/queries/notices';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/patterns/PageHeader';
import { NoticeView } from '../_components/NoticeView';
import { DeleteNoticeButton } from '../_components/DeleteNoticeButton';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function formatDate(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function NoticeDetailPage({ params }: Props) {
  const session = await requirePageSession(
    PERMISSIONS.NOTICE_READ,
    '/dashboard',
  );
  const { id } = await params;
  const t = await getTranslations('Notices');

  // A9 F3 fix — non-admin 에게 만료/미발행 공지가 노출되지 않도록 actorRole 전달.
  const actorRole = session.roles.includes('ADMIN') ? 'ADMIN' : (session.roles[0] ?? 'VIEWER');
  const notice = await getNoticeById(id, session.workspaceId, {
    actorRole,
  });
  if (!notice) {
    notFound();
  }

  const isAdmin = session.roles.includes('ADMIN');
  const isAuthor = notice.authorId === session.userId;
  const canEdit =
    session.permissions.includes(PERMISSIONS.NOTICE_UPDATE) &&
    (isAdmin || isAuthor);
  const canDelete = session.permissions.includes(PERMISSIONS.NOTICE_DELETE);

  const metaParts = (
    <p className="text-xs text-muted-foreground">
      {t('publishedAt')}: {formatDate(notice.publishedAt)}
      {notice.expiresAt && (
        <>
          {' · '}
          {t('expiresAt')}: {formatDate(notice.expiresAt)}
        </>
      )}
    </p>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {notice.pinned && (
        <div className="mb-4 flex items-center gap-2">
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {t('pinned')}
          </Badge>
        </div>
      )}

      <PageHeader
               title={notice.title}
               meta={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button asChild variant="outline">
                <Link href={`/notices/${notice.id}/edit`}>{t('edit')}</Link>
              </Button>
            )}
            {canDelete && <DeleteNoticeButton noticeId={notice.id} />}
          </div>
        }
      />
      <div className="-mt-6 mb-6">{metaParts}</div>

      <NoticeView bodyMd={notice.bodyMd} />
    </div>
  );
}
