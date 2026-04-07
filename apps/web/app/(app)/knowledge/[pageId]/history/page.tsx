import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  const versions = await getPageVersions(pageId, session.workspaceId);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/knowledge/${pageId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to page
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Version History</h1>
          <p className="text-sm text-gray-500 mt-0.5">{page.title}</p>
        </div>
      </div>

      {versions.length === 0 ? (
        <p className="text-gray-400 italic">No versions found.</p>
      ) : (
        <VersionHistory versions={versions} pageId={pageId} />
      )}
    </div>
  );
}
