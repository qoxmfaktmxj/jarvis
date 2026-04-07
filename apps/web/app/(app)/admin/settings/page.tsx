import { headers } from 'next/headers';
import { db } from '@jarvis/db/client';
import { workspace } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { eq } from 'drizzle-orm';
import { SettingsForm } from '@/components/admin/SettingsForm';

export default async function AdminSettingsPage() {
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');

  const [ws] = await db
    .select({ id: workspace.id, name: workspace.name, code: workspace.code })
    .from(workspace)
    .where(eq(workspace.id, session!.workspaceId))
    .limit(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Workspace-level configuration.</p>
      </div>
      {ws && <SettingsForm workspace={ws} />}
    </div>
  );
}
