import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { getMenuTree } from '@/lib/queries/admin';
import { MenuEditor } from '@/components/admin/MenuEditor';

export default async function AdminMenusPage() {
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const items       = await getMenuTree(session!.workspaceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Menu Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Control menu order, visibility, and role requirements.
        </p>
      </div>
      <MenuEditor initialItems={items as Parameters<typeof MenuEditor>[0]['initialItems']} />
    </div>
  );
}
