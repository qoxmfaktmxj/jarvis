import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getOutManageList } from '@/lib/queries/attendance';
import { OutManagePageClient } from './OutManagePageClient';
import type { PageProps } from '@jarvis/shared/types/page';

export const metadata = { title: 'Out-of-Office Management' };

export default async function OutManagePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) redirect('/dashboard');

  const sp = await searchParams;
  const page = typeof sp?.page === 'string' ? Math.max(1, Number(sp.page)) : 1;
  const status = ['pending', 'approved', 'rejected'].includes(sp?.status as string)
    ? (sp?.status as 'pending' | 'approved' | 'rejected')
    : undefined;

  const isAdmin = hasPermission(session, PERMISSIONS.ATTENDANCE_ADMIN);

  const result = await getOutManageList(session.workspaceId, session.userId, {
    page,
    limit: 20,
    status,
    allUsers: isAdmin,
  });

  return (
    <OutManagePageClient
      initialRecords={result.data}
      isManager={isAdmin}
    />
  );
}
