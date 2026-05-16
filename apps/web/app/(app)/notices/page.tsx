import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { listNotices } from '@/lib/queries/notices';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/patterns/PageShell';
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
    <PageShell
      title={t('title')}
      actions={
        canCreate ? (
          <Button asChild>
            <Link href="/notices/new" aria-label={t('new')}>
              <Plus aria-hidden="true" />
              {t('new')}
            </Link>
          </Button>
        ) : null
      }
    >
      <NoticeList
        notices={data}
        emptyLabel={t('empty')}
        pinnedLabel={t('pinned')}
        publishedAtLabel={t('publishedAt')}
      />
    </PageShell>
  );
}
