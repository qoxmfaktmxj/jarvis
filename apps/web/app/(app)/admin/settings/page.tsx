import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { db } from '@jarvis/db/client';
import { workspace } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { eq } from 'drizzle-orm';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { PageHeader } from '@/components/patterns/PageHeader';

export default async function AdminSettingsPage() {
  const t = await getTranslations('Admin.Settings');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');

  const [ws] = await db
    .select({ id: workspace.id, name: workspace.name, code: workspace.code })
    .from(workspace)
    .where(eq(workspace.id, session!.workspaceId))
    .limit(1);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Settings"
        title={t('title')}
        description={t('description')}
      />
      {ws && <SettingsForm workspace={ws} />}
    </div>
  );
}
