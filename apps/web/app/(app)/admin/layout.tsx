import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@jarvis/auth/session';
import { isAdmin } from '@jarvis/auth/rbac';

const NAV_ITEMS = [
  { href: '/admin/users',            label: 'Users' },
  { href: '/admin/organizations',    label: 'Organizations' },
  { href: '/admin/menus',            label: 'Menus' },
  { href: '/admin/codes',            label: 'Codes' },
  { href: '/admin/companies',        label: 'Companies' },
  { href: '/admin/review-queue',     label: 'Review Queue' },
  { href: '/admin/audit',            label: 'Audit Log' },
  { href: '/admin/search-analytics', label: 'Search Analytics' },
  { href: '/admin/settings',         label: 'Settings' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id') ?? '';
  const session = await getSession(sessionId);

  if (!session || !isAdmin(session)) {
    redirect('/dashboard?error=forbidden');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/40 px-3 py-6">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
