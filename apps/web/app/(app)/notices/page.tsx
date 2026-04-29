import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { listNotices } from '@/lib/queries/notices';
import { PageHeader } from '@/components/patterns/PageHeader';
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        eyebrow="Notices"
        title={t('title')}
        meta={
          canCreate ? (
            <Link
              href="/notices/new"
              aria-label={t('new')}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-(--brand-primary) px-4 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-(--brand-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus) focus-visible:ring-offset-2"
            >
              <Plus aria-hidden="true" className="size-4 shrink-0" />
              {t('new')}
            </Link>
          ) : null
        }
      />

      <NoticeList
        notices={data}
        emptyLabel={t('empty')}
        pinnedLabel={t('pinned')}
        publishedAtLabel={t('publishedAt')}
      />
    </div>
  );
}
