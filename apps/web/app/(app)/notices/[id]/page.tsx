import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getNoticeById } from '@/lib/queries/notices';
import { Button } from '@/components/ui/button';
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

  const notice = await getNoticeById(id, session.workspaceId);
  if (!notice) {
    notFound();
  }

  const isAdmin = session.roles.includes('ADMIN');
  const isAuthor = notice.authorId === session.userId;
  const canEdit =
    session.permissions.includes(PERMISSIONS.NOTICE_UPDATE) &&
    (isAdmin || isAuthor);
  const canDelete = session.permissions.includes(PERMISSIONS.NOTICE_DELETE);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {notice.pinned && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {t('pinned')}
              </span>
            )}
            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
              {notice.sensitivity}
            </span>
          </div>
          <h1 className="text-3xl font-bold">{notice.title}</h1>
          <p className="text-xs text-gray-500">
            {t('publishedAt')}: {formatDate(notice.publishedAt)}
            {notice.expiresAt && (
              <>
                {' · '}
                {t('expiresAt')}: {formatDate(notice.expiresAt)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button asChild variant="outline">
              <Link href={`/notices/${notice.id}/edit`}>{t('edit')}</Link>
            </Button>
          )}
          {canDelete && <DeleteNoticeButton noticeId={notice.id} />}
        </div>
      </div>

      <NoticeView bodyMd={notice.bodyMd} />
    </div>
  );
}
