import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { isAdmin } from '@jarvis/auth/rbac';
import { AdminNav } from './_components/AdminNav';

const NAV_ROUTES = [
  { href: '/admin/users',                    key: 'users' },
  { href: '/admin/organizations',            key: 'organizations' },
  { href: '/admin/menus',                    key: 'menus' },
  { href: '/admin/codes',                    key: 'codes' },
  { href: '/admin/companies',                key: 'companies' },
  { href: '/admin/review-queue',             key: 'reviewQueue' },
  { href: '/admin/audit',                    key: 'auditLog' },
  { href: '/admin/search-analytics',         key: 'searchAnalytics' },
  { href: '/admin/settings',                 key: 'settings' },
  { href: '/admin/llm-cost',                 key: 'llmCost' },
  { href: '/admin/observability/wiki',       key: 'wikiObservability' },
  { href: '/admin/wiki/boundary-violations', key: 'wikiViolations' },
  { href: '/admin/wiki/review-queue',        key: 'wikiReviewQueue' },
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
    label: t(route.key as 'users' | 'organizations' | 'menus' | 'codes' | 'companies' | 'reviewQueue' | 'auditLog' | 'searchAnalytics' | 'settings' | 'llmCost' | 'wikiObservability' | 'wikiViolations' | 'wikiReviewQueue'),
  }));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-surface-200 bg-surface-50 px-3 py-6">
        <p className="mb-4 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-isu-600">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-lime-500 align-middle" />
          {t('title')}
        </p>
        <AdminNav items={NAV_ITEMS} />
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
