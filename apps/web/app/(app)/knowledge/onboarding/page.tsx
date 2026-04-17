import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { GraduationCap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function OnboardingHubPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, session.permissions ?? [], {
    pageType: 'onboarding',
    publishStatus: 'published',
    limit: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge · Onboarding"
        title="Onboarding"
        description="Get up to speed with the company"
      />

      {pages.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No onboarding"
          description="No onboarding documents published yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <Card key={page.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <Link href={`/knowledge/${page.id}`} className="block space-y-1">
                  <p className="font-semibold hover:underline">{page.title}</p>
                  {page.summary && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{page.summary}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-xs">{page.sensitivity}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
