import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { isAdmin } from '@jarvis/auth/rbac';

const NAV_ROUTES = [
  { href: '/admin/users',            key: 'users' },
  { href: '/admin/organizations',    key: 'organizations' },
  { href: '/admin/menus',            key: 'menus' },
  { href: '/admin/codes',            key: 'codes' },
  { href: '/admin/companies',        key: 'companies' },
  { href: '/admin/review-queue',     key: 'reviewQueue' },
  { href: '/admin/audit',            key: 'auditLog' },
  { href: '/admin/search-analytics', key: 'searchAnalytics' },
  { href: '/admin/settings',         key: 'settings' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('Admin.nav');
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id') ?? '';
  const session = await getSession(sessionId);

  if (!session || !isAdmin(session)) {
    redirect('/dashboard?error=forbidden');
  }

  const NAV_ITEMS = NAV_ROUTES.map((route) => ({
    href: route.href,
    label: t(route.key as any),
  }));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/40 px-3 py-6">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('title')}
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
