import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getMenuTree } from '@/lib/queries/admin';
import { MenuEditor } from '@/components/admin/MenuEditor';
import { PageHeader } from '@/components/patterns/PageHeader';

export default async function AdminMenusPage() {
  const t = await getTranslations('Admin.Menus');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const items       = await getMenuTree(session!.workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Menus"
        title={t('title')}
        description={t('description')}
      />
      <MenuEditor initialItems={items as Parameters<typeof MenuEditor>[0]['initialItems']} />
    </div>
  );
}
