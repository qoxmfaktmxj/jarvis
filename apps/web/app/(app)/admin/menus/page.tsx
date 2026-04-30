import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getMenuTree } from '@/lib/queries/admin';
import { PageHeader } from '@/components/patterns/PageHeader';
import { MenuTreeViewer } from './_components/MenuTreeViewer';

export default async function AdminMenusPage() {
  const t = await getTranslations('Admin.Menus');
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id') ?? '';
  const session = await getSession(sessionId);

  // Require ADMIN_ALL — consistent with admin layout guard
  if (!session || !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    redirect('/login');
  }

  const items = await getMenuTree(session.workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Menus"
        title={t('title')}
        description={t('description')}
      />
      <MenuTreeViewer items={items} />
    </div>
  );
}
