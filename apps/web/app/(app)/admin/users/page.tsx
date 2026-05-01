import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getUsers, getOrgTree, getCodesByGroup } from '@/lib/queries/admin';
import { UserTable } from '@/components/admin/UserTable';
import { PageHeader } from '@/components/patterns/PageHeader';

function flattenTree(
  nodes: Array<{ id: string; name: string; children: typeof nodes }>,
  acc: Array<{ id: string; name: string }> = [],
) {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name });
    flattenTree(n.children, acc);
  }
  return acc;
}

export default async function AdminUsersPage() {
  const t = await getTranslations('Admin.Users');
  const headersList = await headers();
  const session = await getSession(headersList.get('x-session-id') ?? '');
  const workspaceId = session!.workspaceId;

  const [{ data: users }, orgTree, positionOptions, jobTitleOptions] = await Promise.all([
    getUsers(workspaceId, { page: 1, limit: 20 }),
    getOrgTree(workspaceId),
    getCodesByGroup(workspaceId, 'POSITION'),
    getCodesByGroup(workspaceId, 'JOB_TITLE'),
  ]);

  void users;
  const orgOptions = flattenTree(orgTree);

  return (
    <div className="space-y-6">
      <PageHeader

        eyebrow="Admin · Users"
        title={t('title')}
        description={t('description')}
      />
      <UserTable
        orgOptions={orgOptions}
        positionOptions={positionOptions}
        jobTitleOptions={jobTitleOptions}
      />
    </div>
  );
}
