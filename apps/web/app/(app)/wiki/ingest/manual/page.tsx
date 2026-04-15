import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { ManualIngestForm } from './_components/ManualIngestForm';

export const dynamic = 'force-dynamic';

export default async function ManualIngestPage() {
  await requirePageSession(PERMISSIONS.FILES_WRITE, '/dashboard');
  const t = await getTranslations('WikiIngest.manual');

  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('description')}</p>
      </div>
      <ManualIngestForm />
    </div>
  );
}
