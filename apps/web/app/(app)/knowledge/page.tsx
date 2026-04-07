import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getPagesByType } from '@/lib/queries/knowledge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, BookOpen } from 'lucide-react';
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
    HUB_SECTIONS.map(async (section) => ({
      ...section,
      pages: await getPagesByType(session.workspaceId, section.type, 4),
    })),
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> Knowledge Base
          </h1>
          <p className="text-gray-500 mt-1">Company-wide documentation and guides</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/knowledge/new">
              <Plus className="h-4 w-4 mr-2" /> New Page
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sectionData.map((section) => (
          <Card key={section.type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{section.label}</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={section.href}>View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.pages.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No pages yet</p>
              ) : (
                section.pages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/knowledge/${page.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <span className="truncate font-medium">{page.title}</span>
                    <span className="flex-none text-xs text-gray-400 ml-2">
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
    </div>
  );
}
