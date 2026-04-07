import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { getUsers, getOrgTree } from '@/lib/queries/admin';
import { UserTable } from '@/components/admin/UserTable';

function flattenTree(nodes: Array<{ id: string; name: string; children: typeof nodes }>, acc: Array<{ id: string; name: string }> = []) {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name });
    flattenTree(n.children, acc);
  }
  return acc;
}

export default async function AdminUsersPage() {
  const headersList = await headers();
  const session = await getSession(headersList.get('x-session-id') ?? '');
  const workspaceId = session!.workspaceId;

  const [{ data: users }, orgTree] = await Promise.all([
    getUsers(workspaceId, { page: 1, limit: 20 }),
    getOrgTree(workspaceId),
  ]);

  void users; // data is fetched client-side; orgTree is passed as static options
  const orgOptions = flattenTree(orgTree);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage workspace members, roles, and organization assignments.
        </p>
      </div>
      <UserTable orgOptions={orgOptions} />
    </div>
  );
}
