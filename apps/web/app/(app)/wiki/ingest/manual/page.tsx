import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageShell } from '@/components/patterns/PageShell';
import { ManualIngestForm } from './_components/ManualIngestForm';

export const dynamic = 'force-dynamic';

export default async function ManualIngestPage() {
  await requirePageSession(PERMISSIONS.ADMIN_ALL, '/dashboard');
  const t = await getTranslations('WikiIngest.manual');

  return (
    <PageShell title={t('title')}>
      <ManualIngestForm />
    </PageShell>
  );
}
