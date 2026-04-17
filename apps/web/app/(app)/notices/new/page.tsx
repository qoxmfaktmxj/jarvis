import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageHeader } from '@/components/patterns/PageHeader';
import NewNoticeClientShell from './_client-shell';

export const dynamic = 'force-dynamic';

export default async function NewNoticePage() {
  await requirePageSession(PERMISSIONS.NOTICE_CREATE, '/notices');
  const t = await getTranslations('Notices');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader eyebrow="Notice · New" title={t('new')} />
      <NewNoticeClientShell />
    </div>
  );
}
