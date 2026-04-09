import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getMenuTree } from '@/lib/queries/admin';
import { MenuEditor } from '@/components/admin/MenuEditor';

export default async function AdminMenusPage() {
  const t = await getTranslations('Admin.Menus');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const items       = await getMenuTree(session!.workspaceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('description')}
        </p>
      </div>
      <MenuEditor initialItems={items as Parameters<typeof MenuEditor>[0]['initialItems']} />
    </div>
  );
}
