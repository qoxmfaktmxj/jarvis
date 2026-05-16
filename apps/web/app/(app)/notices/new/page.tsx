import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageShell } from '@/components/patterns/PageShell';
import NewNoticeClientShell from './_client-shell';

export const dynamic = 'force-dynamic';

export default async function NewNoticePage() {
  await requirePageSession(PERMISSIONS.NOTICE_ADMIN, '/notices');
  const t = await getTranslations('Notices');

  return (
    <PageShell title={t('new')}>
      <NewNoticeClientShell />
    </PageShell>
  );
}
