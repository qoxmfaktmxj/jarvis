import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { isAdmin } from '@jarvis/auth/rbac';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionId = (await headers()).get('x-session-id') ?? '';
  const session = await getSession(sessionId);

  if (!session || !isAdmin(session)) {
    redirect('/dashboard?error=forbidden');
  }

  return <main className="overflow-auto p-8">{children}</main>;
}
