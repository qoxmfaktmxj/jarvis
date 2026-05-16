import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/patterns/PageShell';
import { EmptyState } from '@/components/patterns/EmptyState';
import { FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

export const dynamic = 'force-dynamic';

export default async function HRHubPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, session.permissions ?? [], {
    pageType: 'hr-policy',
    publishStatus: 'published',
    limit: DEFAULT_PAGE_SIZE,
  });

  return (
    <PageShell title="HR Policies">
      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No HR policies"
          description="No HR policy documents published yet."
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
                    <Badge variant="secondary" className="text-xs">HR Policy</Badge>
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
    </PageShell>
  );
}
