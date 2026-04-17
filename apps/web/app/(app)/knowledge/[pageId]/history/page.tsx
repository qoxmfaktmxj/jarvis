import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/PageHeader';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage, getPageVersions } from '@/lib/queries/knowledge';
import { VersionHistory } from '@/components/knowledge/VersionHistory';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function VersionHistoryPage({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    notFound();
  }

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId, session.permissions ?? []);
  if (!page) notFound();

  const versions = await getPageVersions(pageId, session.workspaceId, session.permissions ?? []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge · History"
        title="Version History"
        description={page.title}
        meta={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/knowledge/${pageId}`}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to page
            </Link>
          </Button>
        }
      />

      {versions.length === 0 ? (
        <p className="italic text-muted-foreground">No versions found.</p>
      ) : (
        <VersionHistory versions={versions} pageId={pageId} />
      )}
    </div>
  );
}
