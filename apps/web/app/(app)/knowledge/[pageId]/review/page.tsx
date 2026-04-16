import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/PageHeader';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { ReviewPanel } from '@/components/knowledge/ReviewPanel';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function ReviewPage({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId, session.permissions ?? []);
  if (!page) notFound();

  const canReview = hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE);

  // Only allow access if the page is in a reviewable state or user is a reviewer
  if (!canReview && !canEdit) notFound();

  const mdxContent = page.currentVersion?.mdxContent ?? '';
  const publishStatus = (page.publishStatus ?? 'draft') as 'draft' | 'review' | 'published' | 'archived';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge · Review"
        title={page.title}
        description={page.pageType}
        meta={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/knowledge/${pageId}`}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to page
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <PageViewer mdxContent={mdxContent} />
        </div>
        <div className="space-y-4">
          <ReviewPanel
            pageId={pageId}
            publishStatus={publishStatus}
            canReview={canReview}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
