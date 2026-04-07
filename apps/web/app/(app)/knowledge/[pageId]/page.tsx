import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { PageMetaSidebar } from '@/components/knowledge/PageMetaSidebar';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function KnowledgePageView({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  // Enforce sensitivity visibility rules
  const canViewRestricted = hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
  if (
    (page.sensitivity === 'RESTRICTED' || page.sensitivity === 'SECRET_REF_ONLY') &&
    !canViewRestricted
  ) {
    notFound();
  }

  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE);
  const mdxContent = page.currentVersion?.mdxContent ?? '';

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8">
        <article className="min-w-0">
          <header className="mb-6">
            <h1 className="text-3xl font-bold">{page.title}</h1>
            {page.summary && (
              <p className="mt-2 text-gray-500">{page.summary}</p>
            )}
          </header>
          <PageViewer mdxContent={mdxContent} />
        </article>

        <PageMetaSidebar page={page} canEdit={canEdit} />
      </div>
    </div>
  );
}
