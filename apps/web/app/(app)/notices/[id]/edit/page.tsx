import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getNoticeById } from '@/lib/queries/notices';
import { PageShell } from '@/components/patterns/PageShell';
import EditNoticeClientShell from './_client-shell';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditNoticePage({ params }: Props) {
  const session = await requirePageSession(
    PERMISSIONS.NOTICE_ADMIN,
    '/notices',
  );
  const { id } = await params;
  const t = await getTranslations('Notices');

  const notice = await getNoticeById(id, session.workspaceId);
  if (!notice) {
    notFound();
  }

  const isAdmin = session.roles.includes('ADMIN');
  const isAuthor = notice.authorId === session.userId;
  if (!isAdmin && !isAuthor) {
    // RBAC ownership check
    return (
      <PageShell>
        <p className="text-sm text-destructive">Forbidden</p>
      </PageShell>
    );
  }

  return (
    <PageShell title={t('edit')}>
      <EditNoticeClientShell
        noticeId={notice.id}
        initialData={{
          title: notice.title,
          bodyMd: notice.bodyMd,
          pinned: notice.pinned,
          publishedAt: notice.publishedAt
            ? notice.publishedAt.toISOString()
            : null,
          expiresAt: notice.expiresAt ? notice.expiresAt.toISOString() : null,
        }}
      />
    </PageShell>
  );
}
