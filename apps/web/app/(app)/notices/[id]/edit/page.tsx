import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getNoticeById } from '@/lib/queries/notices';
import { PageHeader } from '@/components/patterns/PageHeader';
import EditNoticeClientShell from './_client-shell';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditNoticePage({ params }: Props) {
  const session = await requirePageSession(
    PERMISSIONS.NOTICE_UPDATE,
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
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-destructive">Forbidden</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        eyebrow="Notice · Edit"
        title={t('edit')}
        description={notice.title}
      />
      <EditNoticeClientShell
        noticeId={notice.id}
        initialData={{
          title: notice.title,
          bodyMd: notice.bodyMd,
          sensitivity: notice.sensitivity,
          pinned: notice.pinned,
          publishedAt: notice.publishedAt
            ? notice.publishedAt.toISOString()
            : null,
          expiresAt: notice.expiresAt ? notice.expiresAt.toISOString() : null,
        }}
      />
    </div>
  );
}
