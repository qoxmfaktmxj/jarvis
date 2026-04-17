import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getPagesByType } from '@/lib/queries/knowledge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/patterns/PageHeader';
import { Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

const HUB_SECTIONS = [
  { label: 'Onboarding', type: 'onboarding', href: '/knowledge/onboarding' },
  { label: 'HR Policies', type: 'hr-policy', href: '/knowledge/hr' },
  { label: 'Tool Guides', type: 'tool-guide', href: '/knowledge/tools' },
  { label: 'FAQ', type: 'faq', href: '/knowledge/faq' },
  { label: 'Glossary', type: 'glossary', href: '/knowledge/glossary' },
  { label: 'Runbooks', type: 'runbook', href: '/knowledge?pageType=runbook' },
  { label: 'Decisions', type: 'decision', href: '/knowledge?pageType=decision' },
  { label: 'Incidents', type: 'incident', href: '/knowledge?pageType=incident' },
] as const;

export default async function KnowledgeHomePage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const canCreate = hasPermission(session, PERMISSIONS.KNOWLEDGE_CREATE);

  const sectionData = await Promise.all(
    HUB_SECTIONS.map(async (section, idx) => ({
      ...section,
      pages: await getPagesByType(
        session.workspaceId,
        session.permissions ?? [],
        section.type,
        idx < 2 ? 4 : 3,
      ),
    })),
  );

  const [hero, compact] = [sectionData.slice(0, 2), sectionData.slice(2)];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge"
        accent="KB"
        title="Knowledge Base"
        description="Company-wide documentation and guides"
        meta={
          canCreate ? (
            <Button asChild>
              <Link href="/knowledge/new">
                <Plus className="mr-2 h-4 w-4" /> New Page
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-12">
        {/* ── HERO 섹션: Onboarding + HR Policies ── */}
        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-surface-500">
            Get Started
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {hero.map((section) => (
              <Card key={section.type} className="p-2">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{section.label}</CardTitle>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={section.href}>View all</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.pages.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No pages yet</p>
                  ) : (
                    section.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={`/knowledge/${page.id}`}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="truncate font-medium">{page.title}</span>
                        <span className="ml-2 flex-none text-xs text-muted-foreground">
                          {page.updatedAt
                            ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                            : ''}
                        </span>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── COMPACT 섹션: Tool Guides ~ Incidents ── */}
        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-surface-500">
            Reference
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {compact.map((section) => (
              <div
                key={section.type}
                className="rounded-lg border border-surface-200 bg-card p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">{section.label}</h3>
                  <Button variant="ghost" size="sm" asChild className="-mr-2">
                    <Link href={section.href}>View all</Link>
                  </Button>
                </div>
                <div className="space-y-1">
                  {section.pages.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No pages yet</p>
                  ) : (
                    section.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={`/knowledge/${page.id}`}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="truncate font-medium">{page.title}</span>
                        <span className="ml-2 flex-none text-xs text-muted-foreground">
                          {page.updatedAt
                            ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                            : ''}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
