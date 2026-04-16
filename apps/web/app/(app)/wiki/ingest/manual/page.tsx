import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageHeader } from '@/components/patterns/PageHeader';
import { ManualIngestForm } from './_components/ManualIngestForm';

export const dynamic = 'force-dynamic';

export default async function ManualIngestPage() {
  await requirePageSession(PERMISSIONS.FILES_WRITE, '/dashboard');
  const t = await getTranslations('WikiIngest.manual');

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <PageHeader
        eyebrow="Wiki · Ingest"
        title={t('title')}
        description={t('description')}
      />
      <ManualIngestForm />
    </div>
  );
}
