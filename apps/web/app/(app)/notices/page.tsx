import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { listNotices } from '@/lib/queries/notices';
import { Button } from '@/components/ui/button';
import { NoticeList } from './_components/NoticeList';

export const dynamic = 'force-dynamic';

function pickActorRole(roles: string[]): string {
  if (roles.includes('ADMIN')) return 'ADMIN';
  return roles[0] ?? 'VIEWER';
}

export default async function NoticesPage() {
  const session = await requirePageSession(
    PERMISSIONS.NOTICE_READ,
    '/dashboard',
  );
  const t = await getTranslations('Notices');

  const { data } = await listNotices({
    workspaceId: session.workspaceId,
    actorId: session.userId,
    actorRole: pickActorRole(session.roles),
  });

  const canCreate = session.permissions.includes(PERMISSIONS.NOTICE_CREATE);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        {canCreate && (
          <Button asChild>
            <Link href="/notices/new">{t('new')}</Link>
          </Button>
        )}
      </div>

      <NoticeList
        notices={data}
        emptyLabel={t('empty')}
        pinnedLabel={t('pinned')}
        publishedAtLabel={t('publishedAt')}
      />
    </div>
  );
}
