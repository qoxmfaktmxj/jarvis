import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import NewNoticeClientShell from './_client-shell';

export const dynamic = 'force-dynamic';

export default async function NewNoticePage() {
  await requirePageSession(PERMISSIONS.NOTICE_CREATE, '/notices');
  const t = await getTranslations('Notices');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">{t('new')}</h1>
      <NewNoticeClientShell />
    </div>
  );
}
